-- ── roles · support demand-driven ingestion ────────────────────────────────
-- Ingested roles carry the raw JD text (embedded for recall + read by the match
-- reasoner) and a source marker so admin can tell seed vs freshly-hunted. The
-- seed 557 keep their structured must_haves; ingested ones lean on `description`.
alter table public.roles
  add column if not exists description text,
  add column if not exists source text not null default 'seed';  -- seed | ats

-- URL lookup for dedupe (the ingester checks existence before insert — the seed
-- corpus has a couple of dup URLs so a UNIQUE index isn't safe to add now).
create index if not exists roles_url_idx on public.roles (url);
create index if not exists roles_source_idx on public.roles (source);
