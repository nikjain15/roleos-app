-- ── roles_archive — historical corpus of roles that went off-market ──────────
-- Mirrors public.roles, plus archive provenance. Append-only; the live `roles`
-- table stays live-only, this preserves everything ever seen for model training.
-- Populated by db/seed/refresh-prune.mjs (archive-then-remove).
create table if not exists public.roles_archive (
  id            uuid primary key default gen_random_uuid(),
  company       text not null,
  role_title    text not null,
  url           text,
  ats_provider  text,
  ats_job_id    text,
  archetype     text,
  seniority     jsonb,
  location      jsonb,
  must_haves    jsonb not null default '[]'::jsonb,
  nice_to_haves jsonb not null default '[]'::jsonb,
  scope         jsonb,
  comp          jsonb,
  flags         jsonb,
  keywords      jsonb,
  doc           jsonb not null,           -- full structured JSON incl. _archive block
  source_path   text,                     -- original seed/roles/** path
  fetched_at    date,                     -- last_seen_open
  archived_at   date not null default current_date,
  archive_reason text not null default 'no_longer_live',
  archived_from_url text unique,          -- idempotent re-archive guard
  created_at    timestamptz not null default now()
);
create index if not exists roles_archive_company_idx on public.roles_archive (company);
create index if not exists roles_archive_archetype_idx on public.roles_archive (archetype);
create index if not exists roles_archive_archived_at_idx on public.roles_archive (archived_at);

-- Read-only to clients; service role (training/admin) only. Mirror roles' RLS posture.
alter table public.roles_archive enable row level security;
