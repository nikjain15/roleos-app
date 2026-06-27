-- RoleOS · 0001_init · schema + extensions
-- architecture.md §3. Postgres on Supabase. pgvector for role matching.
-- Every user-owned table carries user_id and is locked by RLS in 0002.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per auth user. `role` is the RBAC gate; default 'user', admin set
-- out-of-band. The role column is made immutable-by-user in 0002 (trigger).
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          text not null default 'user' check (role in ('user','admin')),
  notif_settings jsonb not null default '{"mode":"daily_digest"}'::jsonb,
  quiet_hours   jsonb not null default '{"start":"21:00","end":"08:00","weekends":false}'::jsonb,
  autonomy      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── master_profile (projection) ──────────────────────────────────────────
create table public.master_profile (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── intents / goals ──────────────────────────────────────────────────────
create table public.intents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  target_role text,
  comp        jsonb,
  location    text,
  deadline    date,
  mode        text not null default 'explore' check (mode in ('explore','push')),
  intensity   int  not null default 1,
  created_at  timestamptz not null default now()
);
create index intents_user_idx on public.intents (user_id);

-- ── roles (the 557) — GLOBAL, read-only to users ─────────────────────────
create table public.roles (
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
  flags         jsonb,   -- { green_flags, red_flags }
  keywords      jsonb,
  doc           jsonb not null,  -- full structured JSON, source of truth
  source_path   text unique,     -- jds-structured/** path → idempotent seeding
  fetched_at    date,
  created_at    timestamptz not null default now()
);
create index roles_archetype_idx on public.roles (archetype);
create index roles_company_idx on public.roles (company);

-- ── role_embeddings — pgvector. 768-dim = Workers AI bge-base-en-v1.5 ─────
-- N is fixed by registry.embed.dimensions; query+corpus MUST share the model.
create table public.role_embeddings (
  role_id   uuid not null references public.roles (id) on delete cascade,
  chunk     text not null default 'full',
  model     text not null,
  embedding vector(768) not null,
  primary key (role_id, chunk)
);
create index role_embeddings_ann_idx
  on public.role_embeddings using hnsw (embedding vector_cosine_ops);

-- ── matches (user × role) ────────────────────────────────────────────────
create table public.matches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  role_id        uuid not null references public.roles (id) on delete cascade,
  fit_score      numeric,
  reasoning      jsonb,
  gaps           jsonb,
  recommendation text,
  status         text not null default 'new',
  created_at     timestamptz not null default now(),
  unique (user_id, role_id)
);
create index matches_user_idx on public.matches (user_id);

-- ── decision_events ◆ — APPEND-ONLY substrate (insert-only RLS in 0002) ──
create table public.decision_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,
  subject_ref text,
  action      text not null check (action in
                ('send','skip','edit','reject','correct','approve','view')),
  payload     jsonb,
  weight      numeric not null default 1,
  created_at  timestamptz not null default now()
);
create index decision_events_user_idx on public.decision_events (user_id, created_at);

-- ── taste_model ★ — derived projection; confidence + provenance ─────────
create table public.taste_model (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  attribute      text not null,
  value          jsonb,
  confidence     numeric not null default 0.5,
  evidence       jsonb,   -- decision_event ids
  user_confirmed boolean not null default false,
  updated_at     timestamptz not null default now(),
  unique (user_id, attribute)
);
create index taste_model_user_idx on public.taste_model (user_id);

-- ── artifacts ────────────────────────────────────────────────────────────
create table public.artifacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role_id    uuid references public.roles (id) on delete set null,
  type       text not null check (type in
               ('resume','cover','screening','build','case_study','counter')),
  content    jsonb not null default '{}'::jsonb,
  provenance jsonb,   -- your-thinking vs RO-built % (gate 3 authenticity gate)
  status     text not null default 'draft'
               check (status in ('draft','needs_your_eyes','approved','sent')),
  version    int not null default 1,
  created_at timestamptz not null default now()
);
create index artifacts_user_idx on public.artifacts (user_id);

-- ── pipeline ─────────────────────────────────────────────────────────────
create table public.pipeline (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  role_id   uuid references public.roles (id) on delete set null,
  stage     text not null default 'matched',
  messages  jsonb,
  rounds    jsonb,
  debriefs  jsonb,
  updated_at timestamptz not null default now()
);
create index pipeline_user_idx on public.pipeline (user_id);

-- ── agent_runs ⚑ — admin-only surface; every model call + judge verdict ──
create table public.agent_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete set null,
  skill         text,
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric not null default 0,
  stop_reason   text,
  trace         jsonb,
  judge_verdict jsonb,
  created_at    timestamptz not null default now()
);
create index agent_runs_created_idx on public.agent_runs (created_at);
