-- ── Presence (inbound half of the system) ───────────────────────────────────
-- Roles and Tracker are the user going to the market; Presence is the market
-- coming to them (inbound measured at 4 genuine approaches in ~20 months — the
-- thinnest part of the search). Phase 1: poll saved searches daily via API
-- Direct, dedupe, filter and rank DETERMINISTICALLY (no model calls), and show
-- a ranked "worth commenting on" list. The system finds posts; the human writes
-- every comment. Drafting arrives in phase 2, trained on the feedback captured
-- here from day one.
--
-- Ported from the local console at nik-jain-jobos/social/signals (launchd on a
-- laptop) so collection runs in the cron worker and works with the laptop shut.
-- NOTE: migrations 0024–0026 are reserved by the in-flight LinkedIn job-sourcing
-- branch; this file starts at 0027 to avoid colliding with it.

-- One row = one saved search, re-run on a schedule. Adding a person to watch is
-- an INSERT, not a deploy. The `type` column maps to API Direct's LinkedIn
-- filter set; three of its constraints are undocumented and were found live on
-- 2026-08-11 (author max 5 comma-separated values; author_company wants numeric
-- LinkedIn company IDs; author_title requires a query alongside). They are
-- enforced in lib/presence/apidirect.ts and at the API route.
create table if not exists public.presence_sources (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  slug           text not null,
  platform       text not null check (platform in ('linkedin', 'twitter', 'reddit')),
  type           text not null check (type in ('keyword', 'author', 'company', 'title', 'industry', 'mentions')),
  value          text not null,
  query          text,
  enabled        boolean not null default true,
  interval_hours integer not null default 24,
  pages_per_poll integer not null default 1,
  note           text not null default '',
  -- Poll health, written by the cron collector. fill_history keeps the last 14
  -- fill rates; ~100% means the 20-post window overflowed and posts were missed
  -- (shorten the interval), under 10% means mostly re-reading (lengthen it).
  last_polled_at timestamptz,
  last_fetched   integer,
  last_unseen    integer,
  last_fill_rate numeric,
  last_error     text,
  fill_history   jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  unique (user_id, slug)
);

-- One collector pass over the due sources. per_source carries the fill-rate
-- report; dropped_by_reason is the visible filter ("a filter nobody can see
-- reads as full coverage when it is not"); config snapshots the thresholds the
-- run used. cost_usd: $0.006/request, 20 posts/page, only 2xx bills.
create table if not exists public.presence_runs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  at                timestamptz not null default now(),
  requests          integer not null default 0,
  cost_usd          numeric not null default 0,
  fetched           integer not null default 0,
  new_items         integer not null default 0,
  kept              integer not null default 0,
  dropped           integer not null default 0,
  per_source        jsonb not null default '[]'::jsonb,
  dropped_by_reason jsonb not null default '{}'::jsonb,
  config            jsonb not null default '{}'::jsonb
);

-- Every post a run pulled in that had not been seen before, with its score and
-- what happened to it. status 'kept' rows feed Respond (top N) and the Feed;
-- 'dropped' rows stay visible with their reason. (user_id, url) is the
-- cross-run dedupe: a post is only ever scored the first time it appears.
create table if not exists public.presence_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  source_id       uuid references public.presence_sources (id) on delete set null,
  run_id          uuid references public.presence_runs (id) on delete set null,
  url             text not null,
  platform        text not null,
  author          text,
  author_headline text,
  title           text,
  body            text,
  posted_at       timestamptz,
  engagement      integer,
  age_hours       numeric,
  score           integer,
  hits            jsonb not null default '[]'::jsonb,
  status          text not null check (status in ('kept', 'dropped')),
  drop_reason     text,
  first_seen_at   timestamptz not null default now(),
  unique (user_id, url)
);

create index if not exists presence_items_user_run_idx on public.presence_items (user_id, run_id);
create index if not exists presence_items_user_seen_idx on public.presence_items (user_id, first_seen_at desc);
create index if not exists presence_sources_user_idx on public.presence_sources (user_id);
create index if not exists presence_runs_user_at_idx on public.presence_runs (user_id, at desc);

-- The accept/reject/skip signal plus any comment drafted in the console. This
-- is the corpus phase 2 trains on, collected from day one on purpose: the
-- buttons exist before the drafter does. verdict null = a note-only save.
create table if not exists public.presence_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  url        text not null,
  verdict    text check (verdict in ('worth', 'maybe', 'no', 'posted')),
  note       text not null default '',
  posted_at  timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);

-- Filter thresholds the user tunes from the Filter view (max_age_hours,
-- max_engagement, min_score, top_n, dead_after_hours). Merged over the code
-- defaults at collect time, exactly as scoring.json did locally.
create table if not exists public.presence_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  scoring    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Owner RLS on everything; the cron collector writes via service role.
alter table public.presence_sources  enable row level security;
alter table public.presence_runs     enable row level security;
alter table public.presence_items    enable row level security;
alter table public.presence_feedback enable row level security;
alter table public.presence_settings enable row level security;

create policy presence_sources_owner_sel on public.presence_sources
  for select using (user_id = auth.uid());
create policy presence_sources_owner_ins on public.presence_sources
  for insert with check (user_id = auth.uid());
create policy presence_sources_owner_upd on public.presence_sources
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy presence_sources_owner_del on public.presence_sources
  for delete using (user_id = auth.uid());

create policy presence_runs_owner_sel on public.presence_runs
  for select using (user_id = auth.uid());

create policy presence_items_owner_sel on public.presence_items
  for select using (user_id = auth.uid());

create policy presence_feedback_owner_sel on public.presence_feedback
  for select using (user_id = auth.uid());
create policy presence_feedback_owner_ins on public.presence_feedback
  for insert with check (user_id = auth.uid());
create policy presence_feedback_owner_upd on public.presence_feedback
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy presence_feedback_owner_del on public.presence_feedback
  for delete using (user_id = auth.uid());

create policy presence_settings_owner_sel on public.presence_settings
  for select using (user_id = auth.uid());
create policy presence_settings_owner_ins on public.presence_settings
  for insert with check (user_id = auth.uid());
create policy presence_settings_owner_upd on public.presence_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
