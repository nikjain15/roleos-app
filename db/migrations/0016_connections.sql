-- ── connections (referral finder, slice X6 — approved sources A+D) ──────────
-- The user's OWN people: rows from their LinkedIn data export (source 'csv',
-- LinkedIn's own "Get a copy of your data" mechanism — we never touch LinkedIn)
-- or typed by hand (source 'manual'). Owner RLS, deletable in one click —
-- consent-clean by construction. `note` is the user's real relationship note;
-- it is the ONLY relationship claim the intro-ask drafter may use (truth gate).
create table if not exists public.connections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  company    text,
  title      text,
  email      text,
  source     text not null default 'manual' check (source in ('csv', 'manual')),
  note       text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists connections_user_idx on public.connections (user_id);

alter table public.connections enable row level security;

create policy connections_owner_sel on public.connections
  for select using (user_id = auth.uid());
create policy connections_owner_ins on public.connections
  for insert with check (user_id = auth.uid());
create policy connections_owner_upd on public.connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy connections_owner_del on public.connections
  for delete using (user_id = auth.uid());

-- Intro asks are artifacts like every other draft (truth-gated, human-sent):
-- widen the type check. Additive only — every existing value stays legal.
alter table public.artifacts drop constraint if exists artifacts_type_check;
alter table public.artifacts add constraint artifacts_type_check
  check (type in ('resume', 'cover', 'screening', 'build', 'case_study', 'counter', 'intro'));
