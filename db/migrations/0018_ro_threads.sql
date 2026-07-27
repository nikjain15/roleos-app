-- ── ro_threads (RO memory M2 — conversation continuity) ─────────────────────
-- docs/specs/ro-memory.md, M2. Server-side thread per (user, surface) so RO
-- remembers the actual back-and-forth — not just durable facts (M1's notebook).
-- Still "notebook, not a recording": we keep a rolling SUMMARY of older turns +
-- the last few verbatim turns, so context stays BOUNDED (O(1) per reply) no matter
-- how long the conversation runs. One row per surface; replaces the localStorage-
-- only Explore thread and unifies the dock + Explore + résumé command bar.
create table if not exists public.ro_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  surface    text not null,                 -- 'dock' | 'explore' | 'resume:<uuid>'
  summary    text not null default '',       -- rolling summary of the older turns
  turns      jsonb not null default '[]',     -- last-k verbatim [{q,a}], bounded
  updated_at timestamptz not null default now(),
  unique (user_id, surface)
);

create index if not exists ro_threads_user_idx on public.ro_threads (user_id);

-- Owner RLS: a thread is the user's own conversation with RO (mirrors ro_memory).
alter table public.ro_threads enable row level security;

create policy ro_threads_owner_sel on public.ro_threads
  for select using (user_id = auth.uid());
create policy ro_threads_owner_ins on public.ro_threads
  for insert with check (user_id = auth.uid());
create policy ro_threads_owner_upd on public.ro_threads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ro_threads_owner_del on public.ro_threads
  for delete using (user_id = auth.uid());
