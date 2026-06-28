# Plan — admin-triggered ATS ingestion pipeline

Status: **PLAN** (logic proven end-to-end locally on 2026-06-28; this is about
moving it into the app, behind the admin view, on Cloudflare). Owner: Nik.

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

## Open decisions for Nik
- **Queue vs cron-drain for the slow half** — start with the `ingest_queue` table +
  cron-drain (no new binding, ships fastest), or go straight to a Cloudflare Queue/
  Workflow (more robust, more setup)? Recommend table+cron MVP, Queue at Phase 3.
- **Company list home** — keep YAML in repo (`config/companies.yml`, copied from the
  pipeline) or a `companies` DB table editable from admin? DB table unlocks the
  Phase-3 admin "enable candidate" UX but is more work.
- **Extraction engine in-app** — Claude-only in the Worker (clean, ~$0.005/role), or
  also support the local Ollama hybrid for bulk backfills (cheaper, local-only)?
- **Trigger scope** — admin button runs a full scan, or lets you pick sectors/
  companies (e.g. "just the AI labs", "just demand-wanted")?
