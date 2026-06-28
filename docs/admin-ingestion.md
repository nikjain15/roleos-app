# Plan — admin-triggered ATS ingestion pipeline

Status: **FINALIZED — decisions locked 2026-06-28** (see "Locked decisions" +
"Revised architecture" below). Logic proven end-to-end; this is productionizing
it behind `/admin` on Cloudflare. Owner: Nik.

> **Manual admin control — answer to "can I configure ingestion from /admin?":**
> Not yet. What's live today is the hourly cron over a seed list (see "Shipped
> baseline" below). This plan is exactly what adds the admin Run button, scope
> pickers, live progress panel, and editable company list. Building it delivers
> that control.

Turns today's manual pipeline into a first-class, admin-triggered (and later
ambient/cron) feature: **scan ATS boards → diff vs live roles → archive+remove
dead → extract new via Claude → upsert + embed**, with run status in `/admin`.

## Why now
- `/admin` already renders the **demand signal** ("what people are hunting for —
  drives ingestion") and literally says the ingestion pipeline reads it — but
  there's **no control to run ingestion**. This adds the trigger + the engine.
- A prior session flagged the gap: *"No live role-ingestion pipeline. The
  always-on hunt needs a feed of fresh postings."* This closes it.
- The whole flow was validated today (557→404 prune+archive, +375 backfill, +60
  from disabled-company enablement → **691 live roles, all embedded**). The Node
  scripts in `role-os-archive/pipeline/` + `roleos/db/seed/` are the reference impl.

## The hard constraint
A Worker request can't run a 15-min, 300-role Claude extraction (CPU/subrequest/
time limits). So the pipeline must split into a **cheap synchronous half** (scan/
diff/prune — fast fetches + DB compare) and a **slow chunked half** (per-role
fetch→extract→embed) that runs across many short invocations. This mirrors the
existing `/api/cron/digests` pattern (`maxDuration=300`, `MAX_PER_RUN` cap, "a
Queue/Workflow can scale this later").

## Available today (no new infra needed for MVP)
- `AI` binding (Workers AI bge-base-en-v1.5) — embeddings run **in-Worker**, better
  than the local HTTP path that kept dropping.
- `supabaseService()` service-role client; `requireAdmin()` gate; `CRON_SECRET`
  + the dedicated `roleos-cron` worker already calling secret-gated endpoints.
- `nodejs_compat`. The ATS fetchers + Claude extraction prompt are **plain fetch**
  → portable into `lib/` almost verbatim.

## Architecture

### New DB (migration 0007)
```sql
create table ingestion_runs (
  id uuid pk, trigger text,            -- 'admin' | 'cron'
  status text,                          -- queued|scanning|extracting|done|error
  started_at, finished_at timestamptz,
  scanned int, new int, closed int, extracted int, failed int,
  detail jsonb, error text);
create table ingest_queue (             -- the work list the slow half drains
  id uuid pk, run_id uuid, company text, role_title text, url text unique,
  ats jsonb, status text default 'pending',  -- pending|done|error
  attempts int default 0, error text, created_at timestamptz);
```
(We hard-remove dead roles + archive to `archive/roles/` per Nik's policy, so no
status column on `roles`; closed handling stays delete+archive.)

### Code to port into the app (`roleos/lib/ingest/`)
- `scan.ts` — ATS adapters (greenhouse/ashby/lever/workday) + title/location
  filters. From `pipeline/scripts/lib/{ats,filters}.mjs`.
- `diff.ts` — current-open vs `public.roles` join by ATS board token → new/closed.
  From `today-diff.mjs`.
- `extract.ts` — Claude Sonnet 4.6 JD→structured (the gold prompt). From
  `03-extract-jd.mjs`. (Hybrid Ollama path stays a LOCAL-only option.)
- `embed.ts` — `env.AI.run('@cf/baai/bge-base-en-v1.5', …)` in-Worker.
- Company list + filters move from `pipeline/config/*.yml` into the repo
  (`config/`) or a `companies` DB table (so admin can edit — see Phase 3).

### Endpoints
- `POST /api/admin/ingest` — `requireAdmin()`. Creates an `ingestion_runs` row,
  runs **scan+diff inline** (chunked across companies), **archives+removes closed**,
  enqueues new roles into `ingest_queue`, returns `{runId, new, closed}` fast.
- `POST /api/cron/ingest-extract` — secret-gated. Pulls ≤`MAX_PER_RUN` pending from
  `ingest_queue`; per role: fetch JD → Claude extract → upsert `roles` → embed via
  `AI` → mark done. Idempotent, resumable. The `roleos-cron` worker calls it
  repeatedly until the queue drains (then on the weekly cadence).
- (Scale option) replace the queue table + cron-drain with a **Cloudflare Queue** +
  consumer, or a **Workflow** for durable fan-out. Recommended once volume grows;
  the table+cron MVP ships first with zero new bindings.

### Admin UI (`/admin`)
- A **"Run ingestion"** button → POST `/api/admin/ingest`; shows the returned
  new/closed counts immediately.
- An **Ingestion** panel: last N `ingestion_runs` (status, counts, duration) +
  live `ingest_queue` depth (pending/done/failed) — polled, like a job monitor.
- Wire to the existing **DemandView**: prioritize the queue by most-wanted
  companies/roles; surface wanted companies **not yet in the list** as
  "candidates to enable."

## Phases
1. **MVP** — migration 0007; port `scan`/`diff` to `lib/ingest`; `/api/admin/ingest`
   (scan+diff+prune+enqueue); admin button + runs panel. *Cheap half, visible.*
2. **Extractor** — port `extract`/`embed`; `/api/cron/ingest-extract` drain;
   cron worker drives it; admin shows queue progress. *Slow half.*
3. **Demand-driven** — prioritize by DemandView; auto-probe ATS for wanted/disabled/
   net-new companies (port `discover-disabled.mjs`); admin "enable candidate" action;
   manage company list from admin.
4. **Ambient** — cron fires daily scan + weekly extract automatically (the
   `setup-role-refresh.md` cadence), so it's both admin-triggered and always-on.

## Locked decisions (Nik, 2026-06-28)
- **Slow half = Cloudflare Workflow.** Durable multi-step execution with built-in
  retries/observability. Replaces the queue-table+cron-drain MVP — go straight to
  the robust path. Adds a `workflows` binding in `wrangler.jsonc` + the Agents-SDK
  Workflows runtime. `ingest_queue` becomes optional (the Workflow holds step
  state); keep `ingestion_runs` as the admin-facing progress/audit record the
  Workflow writes to.
- **Companies live in a DB table** (`companies`), admin-editable. Seed once from
  `pipeline/config/companies.yml`. Scan reads from the table; admin can enable/
  disable/add and promote discovered candidates. Filters (`title`/`location`) also
  move to a config row/table so they're tunable without redeploy.
- **Hybrid extractor.** The Workflow's extract step uses **Claude Sonnet 4.6** in
  cloud (unattended, ~$0.005/role). The **local Ollama** path stays as a separate
  bulk-backfill script (cheap, local-only) — selectable via a run param
  `engine: 'claude' | 'ollama'` (ollama only valid for local-triggered runs).
- **Trigger = full + scoped.** `POST /api/admin/ingest` takes
  `{ scope: 'all' | {sectors?[], companies?[]} | 'demand', engine }`. Admin UI
  offers a "Run all" button **and** scoped pickers (sector / company / demand-wanted).

## Revised architecture (reflecting the locks)
- `wrangler.jsonc`: add a **Workflow** binding `INGEST` → class `IngestWorkflow`.
- **`IngestWorkflow`** (durable steps, one instance per run, id == `ingestion_runs.id`):
  1. `scan` — read enabled `companies`, fetch each board, filter → current-open set.
  2. `diff` — join vs `public.roles` by board token → new[] / closed[].
  3. `prune` — archive closed docs (→ `roles_archive` table / `archive/roles/`),
     delete from `public.roles`. (Per hard-remove policy.)
  4. `extract` (fan-out, one durable step per new role, Claude) — fetch JD →
     structured JSON → upsert `roles` → embed via `AI` binding. Retries per role.
  5. `finalize` — write counts to `ingestion_runs`, status `done`.
  Each step updates `ingestion_runs` so `/admin` shows live progress.
- **`POST /api/admin/ingest`** (`requireAdmin`): create `ingestion_runs`, start an
  `INGEST` Workflow instance with `{scope, engine}`, return `{runId}` immediately.
- **`/admin`**: "Run ingestion" (+ scoped pickers) → POST; an **Ingestion panel**
  polling `ingestion_runs` (status, per-step counts, duration) + a **Companies**
  manager (enable/disable/add, discovered candidates) reading/writing the new table.
- Ambient: the `roleos-cron` worker starts the same Workflow on the daily-scan/
  weekly-extract cadence.

---

## Shipped baseline (this repo, as of 2026-06-28) — what the Workflow replaces/wraps
The interim, working pipeline already deployed in `roleos` (the MVP this plan
upgrades to a Workflow):
- **`lib/ats.ts`** — Greenhouse / Ashby / Lever fetchers (tries each per slug).
  *(Workday is the 4th fetcher to add — 17 seed roles use it.)*
- **`lib/ingest.ts`** — fetch → filter to PM/AI titles → dedupe by URL → embed
  (in-Worker `AI` bge, same vector space) → insert (`source='ats'`, `doc` set,
  `description`). **No Claude extract step yet** — that's locked decision #5 /
  Workflow step 4, which gives ingested roles the seed's structured richness.
- **`/api/cron/ingest`** (secret-gated) — reads `intents.companies`+`keywords`
  (demand) then an in-code `SEED_COMPANIES` floor; capped 8 companies × 6 roles.
  *(The `companies` DB table — decision #3 — replaces this hard-coded list.)*
- **`roleos-cron`** worker fires `/api/cron/digests` + `/api/cron/ingest` hourly.
- **Admin Demand view** shows `corpusTotal`, `ingestedTotal`, recently-hunted.
- **Migration 0006** added `roles.description` + `roles.source`. *(0007 adds
  `companies`, `ingestion_runs`, `roles_archive`.)*
- Verified live: Ramp/Notion/Figma → 14 roles added + embedded.

The richer `role-os-archive/pipeline` Node scripts (workday, `discover-disabled`,
the gold extract prompt, 691-role run) are the **reference impl** to fold into
`lib/ingest/` during Phase 1–2.

## Correction — the migration is NOT blocked here
Earlier notes flagged needing a DB password / `SUPABASE_ACCESS_TOKEN`. In this
repo, migrations apply via the **Supabase Management API + PAT**
(`db/seed/apply-migrations.mjs`) — **6 applied this way this session (0001–0006)**.
So **migration 0007 can be applied now**; no DB password, no blocker.

## One correction to the locks — Ollama
Decision #6 keeps an `engine: 'claude' | 'ollama'` seam, with Ollama as a
**local-only bulk-backfill** path. That's fine *as long as Ollama never enters
the Workers runtime* — Flag A dropped Ollama from the deployed stack (one model,
one vector space). Prod/ambient runs are **Claude (extract) + Workers AI bge
(embed)** only. Keep Ollama strictly to local CLI backfills.
