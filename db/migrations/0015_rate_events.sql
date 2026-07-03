-- ── rate_events — shared rolling-window rate-limit log (slice H3) ────────────
-- Generalizes the index_ask_events pattern to EVERY public/AI route: one row
-- per counted request, keyed by (scope, subject) where scope is the route name
-- and subject is an IP (anon routes) or user id (authed routes). Service-role
-- only — RLS enabled with no policies = deny to all clients.
create table if not exists public.rate_events (
  id         bigint generated always as identity primary key,
  scope      text not null,
  subject    text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_scope_subject_time_idx
  on public.rate_events (scope, subject, created_at desc);

alter table public.rate_events enable row level security;
