-- ── role_notes (roles-workspace P1, slice W4) ────────────────────────────────
-- Free-text per-role notes, one row per (user, role). Owner RLS — the note is
-- the user's private working memory on a role ("talked to Sam, comp range X").
create table if not exists public.role_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete cascade,
  note       text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, role_id)
);

create index if not exists role_notes_user_idx on public.role_notes (user_id);

alter table public.role_notes enable row level security;

create policy role_notes_owner_sel on public.role_notes
  for select using (user_id = auth.uid());
create policy role_notes_owner_ins on public.role_notes
  for insert with check (user_id = auth.uid());
create policy role_notes_owner_upd on public.role_notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy role_notes_owner_del on public.role_notes
  for delete using (user_id = auth.uid());
