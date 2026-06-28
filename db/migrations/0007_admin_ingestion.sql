-- ── Admin-controlled ingestion (docs/admin-ingestion.md) ────────────────────
-- companies = the admin-managed scan list (replaces the in-code SEED_COMPANIES);
-- ingestion_runs = the run/progress record /admin polls; roles_archive = pruned
-- (closed) postings kept for audit. All admin/service-side (roles stay read-only
-- to users; these are config + ops surfaces).

create table if not exists public.companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null,                         -- ATS board slug
  ats_provider text,                                  -- greenhouse|ashby|lever|null(try-all)
  sector       text,
  enabled      boolean not null default true,
  source       text not null default 'seed'           -- seed|discovered|demand
    check (source in ('seed','discovered','demand')),
  last_scanned_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (slug)
);
create index if not exists companies_enabled_idx on public.companies (enabled);

create table if not exists public.ingestion_runs (
  id          uuid primary key default gen_random_uuid(),
  trigger     text not null default 'admin',          -- admin|cron
  scope       jsonb,                                  -- {kind:'all'|'sector'|'company'|'demand', ...}
  engine      text not null default 'claude',
  status      text not null default 'queued'          -- queued|scanning|extracting|done|error
    check (status in ('queued','scanning','extracting','done','error')),
  scanned     int not null default 0,
  new_count   int not null default 0,
  closed      int not null default 0,
  extracted   int not null default 0,
  failed      int not null default 0,
  detail      jsonb,
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ingestion_runs_started_idx on public.ingestion_runs (started_at desc);

create table if not exists public.roles_archive (
  id           uuid primary key,                       -- the original roles.id
  company      text,
  role_title   text,
  url          text,
  ats_provider text,
  source       text,
  doc          jsonb,
  archived_at  timestamptz not null default now()
);

-- RLS: admin-only read (service-role writes bypass RLS).
alter table public.companies      enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.roles_archive  enable row level security;

drop policy if exists companies_admin_sel on public.companies;
create policy companies_admin_sel on public.companies for select using (public.is_admin());
drop policy if exists ingestion_runs_admin_sel on public.ingestion_runs;
create policy ingestion_runs_admin_sel on public.ingestion_runs for select using (public.is_admin());
drop policy if exists roles_archive_admin_sel on public.roles_archive;
create policy roles_archive_admin_sel on public.roles_archive for select using (public.is_admin());

-- Seed the scan list (slug = lowercased alphanumeric; provider null = try-all).
insert into public.companies (name, slug, ats_provider, source) values
  ('Ramp','ramp','greenhouse','seed'),
  ('Notion','notion','greenhouse','seed'),
  ('Figma','figma','greenhouse','seed'),
  ('Chime','chime','greenhouse','seed'),
  ('Stripe','stripe','greenhouse','seed'),
  ('Brex','brex',null,'seed'),
  ('Mercury','mercury',null,'seed'),
  ('Vanta','vanta',null,'seed'),
  ('Webflow','webflow',null,'seed'),
  ('Rippling','rippling',null,'seed'),
  ('Databricks','databricks',null,'seed'),
  ('Scale AI','scaleai',null,'seed'),
  ('Anthropic','anthropic',null,'seed'),
  ('OpenAI','openai',null,'seed'),
  ('Palantir','palantir','lever','seed'),
  ('Acorns','acorns','ashby','seed')
on conflict do nothing;
