# Plan — recurring role/company freshness loop

Status: **PLAN ONLY** (approved decisions below; nothing built or run yet).
Author date: 2026-06-28. Owner: Nik.

Keeps the live `public.roles` data current: re-scan enabled companies, extract
new/changed JDs, **detect closed postings**, and expand coverage — on a schedule.

## Decisions locked (2026-06-28)
- **Scope now:** plan first, build after approval.
- **Engine:** hybrid — Ollama first-pass / re-checks, Claude only for *new* or
  *materially changed* JDs (cost control + keeps quality where it matters).
- **Cadence:** **scan daily** (free), **extract weekly**.
- **Coverage:** both — enable the disabled companies that have a working ATS,
  *and* research net-new companies to add.

## Today's state (the gap)
- Pipeline (`role-os-archive/pipeline`, scripts 01–06) is complete but **runs
  manually**; live seed is dated `2026-05-10`, last scan `2026-05-25`.
- `01-scan` only records **new** URLs in `scan-history.tsv`. It cannot see when a
  posting is **taken down** (dead link for users) or **edited** (stale JD).
- The only cron (`roleos/cron`) fires **user digests**, not a data refresh.
- `companies.yml`: 186 companies, **136 enabled / 50 off** (mostly Workday +
  `unknown`; Workday is now supported in `scripts/lib/ats.mjs`).
- `public.roles` has **no lifecycle columns** — no `status`, `last_seen_open`, or
  content hash. Seeding is upsert-on-`source_path`; a removed posting just lingers.

---

## Design

### 1. Freshness loop — daily scan, the core new logic
Today's scan answers "what's new?" We need "what's **new / still-open / closed**?"
Add a per-company **open-set diff**:

1. Daily scan fetches the current open URL set per enabled company (already done
   by `fetchJobs`, just not persisted as a snapshot).
2. Compare against the last snapshot:
   - **new** → queue for extraction.
   - **still-open** → bump `last_seen_open`; if a cheap content hash of the JD
     changed, flag **changed** → queue for re-extraction.
   - **gone** → mark **closed** (do not delete — users may have it in a digest).
3. Persist snapshot per company (e.g. `data/open-snapshots/<company>.json`) so the
   diff is deterministic across runs. `scan-history.tsv` stays as the append-only
   audit log.

New artifact: `scripts/01b-diff-open-set.mjs` (or fold into `01`), writing a
**delta queue** (`data/delta-queue.json`: `{new:[], changed:[], closed:[]}`).

### 2. Weekly extraction — hybrid routing
Consume the week's accumulated delta queue:
- **new** JDs → fetch (`02`) → extract. **Route by confidence:** Ollama first
  (`roleos-admin/extract.mjs`); if the eval-style guard finds thin output
  (missing archetype/location, < N must-haves), escalate that JD to **Claude**
  (`03-extract-jd.mjs`). New senior roles are rare enough that Claude cost stays low.
- **changed** JDs → re-fetch + re-extract (same routing).
- **closed** → no extraction; just the DB status flip (below).
Then `04` render, `05` enrich (only for newly-added companies), `06` embeddings
for new/changed roles only.

Reuses what exists: `roleos-admin` already has Ollama extract + an eval harness to
define the "thin output → escalate" rule. No new extractor needed — just a router.

### 3. Where it runs (the hybrid/cadence tension, resolved)
Ollama is **local-only** — it cannot run on Cloudflare cron. So split by cost/locality:
- **Daily scan + diff → cloud.** Pure `fetch` + JSON diff, no model. Add a
  `scheduled` handler to the existing `roleos/cron` worker (or a sibling worker)
  hitting a new secret-gated `POST /api/cron/scan`. Free, unattended. It writes
  the delta queue to Supabase/R2.
- **Weekly extraction → local scheduled job** (macOS `launchd`/cron on this Mac),
  because the hybrid first-pass uses Ollama. It pulls the week's delta queue,
  runs the router, copies results into `roleos/seed/roles/`, then
  `npm run seed:roles` + `npm run embed:roles`.
  - Tradeoff to accept: the weekly extract needs the machine awake at run time.
  - Two-way door: if you later want it fully unattended, drop Ollama and make the
    weekly job **Claude-only** on a Cloudflare cron / scheduled agent. The router
    interface is identical; only the first-pass engine changes.

### 4. DB changes — role lifecycle (migration `0006_role_lifecycle.sql`)
```sql
alter table public.roles
  add column status         text not null default 'open'
                            check (status in ('open','changed','closed')),
  add column last_seen_open date,
  add column content_hash   text,          -- cheap dedupe of JD body
  add column closed_at       date;
create index roles_status_idx on public.roles (status);
```
- Seeding stays upsert-on-`source_path`; the weekly job additionally sets
  `status='closed', closed_at=...` for URLs the diff reports gone.
- **App/match must filter `status='open'`** so users never see dead links. (Audit
  the role-serving + match queries when this lands.)

### 5. Coverage expansion
- **Enable existing (50 off):** run `scripts/verify-companies.mjs` to health-check
  each disabled slug/ATS; flip `enabled: true` only where it returns jobs. Most are
  Workday (now supported) — biggest easy win.
- **Discover net-new:** research task (WebSearch) for AI-lab / agent-AI / AI-infra /
  fintech / voice-AI companies founded or scaled since the May list, that post
  senior PM / TPM / Growth / CoS / Strategy & Ops roles on a supported ATS
  (greenhouse/ashby/lever/workable/workday). Output = proposed `companies.yml`
  additions for your review before enabling. Cadence: re-run discovery monthly.

---

## Rough cost
- Daily scan + diff: **$0** (CF cron, fetch only).
- Weekly extract: Ollama first-pass **$0**; Claude only on escalations. At ~tens of
  new/changed senior roles/week and a few cents/JD, **< ~$1–3/week** typical.
- Discovery: WebSearch, monthly — negligible.

## Build order (when approved)
1. `0006_role_lifecycle.sql` + open-set snapshot/diff (`01b`) + delta queue.
2. Hybrid extraction router (Ollama→Claude escalation) over the delta queue.
3. Cloud daily-scan cron handler + secret-gated endpoint.
4. Local weekly `launchd` job: extract → seed → embed; filter `status='open'` in app.
5. Coverage: `verify-companies` sweep to enable the 50; first discovery pass.

## Open questions for Nik
- Delta queue + snapshots: store in **R2/Supabase** (cloud scan writes, local
  extract reads) or keep file-based and have the cloud scan POST results back?
- Discovery breadth: keep the current sector set, or add any (e.g. defense-tech,
  climate, healthcare-AI)?
- Closed roles in digests: hide immediately, or show "closed" for one cycle so a
  user who saw it isn't confused?
