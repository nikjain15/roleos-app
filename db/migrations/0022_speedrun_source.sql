-- ── Speedrun (a16z) as a company source ─────────────────────────────────────
-- lib/ingest/speedrun.ts pulls the public speedrun-talent-network.com API's
-- company list into the scan list. Its roles then flow through the existing
-- scan → extract → embed → prune pipeline like any other company; we take the
-- companies, not the postings (see that file for why). Additive + idempotent.
alter table public.companies drop constraint if exists companies_source_check;
alter table public.companies
  add constraint companies_source_check
  check (source in ('seed','discovered','demand','yc','speedrun'));
