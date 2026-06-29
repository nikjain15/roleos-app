-- ── roles_archive — historical corpus of roles that went off-market ──────────
-- NOTE: a roles_archive table already existed in this project (created out-of-band
-- by an earlier session) with columns: id, company, role_title, url, ats_provider,
-- source, doc (full structured JSON), archived_at. This migration is written to be
-- IDEMPOTENT and ALIGNED with that table — it only adds what's missing, never drops.
-- The `doc` jsonb is the source of truth (holds every extracted field), so the live
-- `roles` table stays lean while this preserves everything ever seen, for training.
-- Populated by db/seed/refresh-prune.mjs (archive-then-remove) on each refresh.
create table if not exists public.roles_archive (
  id           uuid primary key default gen_random_uuid(),
  company      text not null,
  role_title   text not null,
  url          text,
  ats_provider text,
  source       text,
  doc          jsonb not null,
  archived_at  timestamptz not null default now()
);

-- The table pre-existed without column defaults; set them idempotently so plain
-- inserts/upserts work (no-op if already set).
alter table public.roles_archive alter column id set default gen_random_uuid();
alter table public.roles_archive alter column archived_at set default now();

-- Full unique index on url → idempotent archival (upsert on conflict). NOT partial:
-- ON CONFLICT can't target a partial index. Postgres allows multiple NULL urls.
create unique index if not exists roles_archive_url_key
  on public.roles_archive (url);
create index if not exists roles_archive_company_idx on public.roles_archive (company);
create index if not exists roles_archive_archived_at_idx on public.roles_archive (archived_at);

-- Service-role / admin only (training + ingestion). RLS on, no client policy = deny.
alter table public.roles_archive enable row level security;
