-- ── Adaptive scan cadence (docs/admin-ingestion.md · freshness loop) ────────
-- The sweep re-scans every enabled company on one fixed interval, but the boards
-- are not equally worth revisiting: a measured sample found ~a quarter of them
-- yield zero in-scope roles every time (tiny startups, boards with no product or
-- AI/ML openings, companies with no reachable board at all). Re-fetching those
-- every few days costs no Claude spend — the fetch is free and dedupe happens
-- before extract — but it burns sweep wall-clock and Workflow subrequests that
-- the productive companies are queued behind.
--
-- So the due set moves from "one interval for everyone" to a per-company
-- `next_scan_at`, written each time we scan. Companies that keep coming up empty
-- back off (3d → 6d → 12d → 24d, capped); any company that yields a role resets
-- to the base cadence immediately.

-- Consecutive scans that returned zero in-scope postings. Reset to 0 on any hit.
alter table public.companies
  add column if not exists barren_streak int not null default 0;

-- When this company is next due. NULL = due now, which is what every existing
-- row wants: the corpus has been frozen since 2026-06-30 and needs a full sweep.
alter table public.companies
  add column if not exists next_scan_at timestamptz;

-- The due query is `enabled AND (next_scan_at IS NULL OR next_scan_at < now())`
-- ordered by next_scan_at — index it so the sweep's per-batch lookup stays cheap
-- as the company list grows.
create index if not exists companies_next_scan_at_idx
  on public.companies (next_scan_at)
  where enabled;
