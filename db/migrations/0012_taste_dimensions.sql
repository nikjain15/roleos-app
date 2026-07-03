-- ── taste_dimensions ★ — the structured 15-dim self-learning model (buildplan §1)
-- One row per (user, dimension 1–15). Holds RO's derived inference + confidence +
-- provenance, and — crucially — the user's OWN correction/confirmation (transparent
-- + correctable, goal-engine §7). user-own RLS. Derived on read; this table caches
-- the snapshot and, above all, persists user overrides.
create table if not exists public.taste_dimensions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  dimension     int not null check (dimension between 1 and 15),
  inference     jsonb,                                -- {text, basis}
  confidence    numeric not null default 0.1,
  provenance    jsonb,                                -- decision_event ids / signal summary
  user_note     text,                                 -- the user's correction, if any
  user_confirmed boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (user_id, dimension)
);

create index if not exists taste_dimensions_user_idx on public.taste_dimensions (user_id);

-- ── RLS: user-own (default deny; owner sel/ins/upd/del; admins read) ─────────
alter table public.taste_dimensions enable row level security;

create policy taste_dimensions_owner_sel on public.taste_dimensions
  for select using (user_id = auth.uid() or public.is_admin());
create policy taste_dimensions_owner_ins on public.taste_dimensions
  for insert with check (user_id = auth.uid());
create policy taste_dimensions_owner_upd on public.taste_dimensions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy taste_dimensions_owner_del on public.taste_dimensions
  for delete using (user_id = auth.uid());
