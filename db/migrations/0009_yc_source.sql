-- ── YC as a sourcing source (docs/admin-ingestion.md) ───────────────────────
-- The YC sync (lib/ingest/yc.ts) pulls the yc-oss public company API into the
-- admin-managed `companies` scan list. New rows land with source='yc'; the
-- existing scan → extract → embed → prune machinery then sources their roles on
-- the normal cadence (no new pipeline). Additive + idempotent.

-- 1) Allow 'yc' as a company source. The 0007 constraint was created inline, so
--    Postgres named it companies_source_check — drop + recreate to widen it.
alter table public.companies drop constraint if exists companies_source_check;
alter table public.companies
  add constraint companies_source_check
  check (source in ('seed','discovered','demand','yc'));

-- 2) Provenance columns for the YC source (nullable → safe for existing rows).
--    yc_slug = YC's own company slug (stable id, used for idempotent re-sync);
--    yc_batch = e.g. 'Winter 2012'; homepage = the company's own site.
alter table public.companies add column if not exists yc_slug  text;
alter table public.companies add column if not exists yc_batch text;
alter table public.companies add column if not exists homepage text;

-- yc_slug is the natural key for YC-origin rows; index it for re-sync lookups.
create index if not exists companies_yc_slug_idx on public.companies (yc_slug);
