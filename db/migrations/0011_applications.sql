-- ── applications ◆ — the tracker = funnel source of truth (buildplan §1) ─────
-- One row per role the user is pursuing; its stage + append-only stage_history
-- feed the pace engine's real conversion rates (dimension 14) and the Feed
-- agenda. user-own RLS. One application per (user, role).
create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  goal_id       uuid references public.goals (id) on delete set null,
  role_id       uuid references public.roles (id) on delete set null,
  stage         text not null default 'saved'
                  check (stage in ('saved','drafting','ready','applied','screening',
                                   'interviewing','onsite','offer','rejected','withdrawn')),
  stage_history jsonb not null default '[]'::jsonb,  -- append-only [{stage, at}]
  artifact_ids  jsonb,                                -- linked résumé/proof artifacts
  next_action   jsonb,                                -- {label, due?}
  sent_at       timestamptz,                          -- when it hit 'applied'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists applications_user_idx on public.applications (user_id, stage);
create unique index if not exists applications_user_role_uniq
  on public.applications (user_id, role_id) where (role_id is not null);

-- ── RLS: user-own (default deny; owner sel/ins/upd/del; admins read) ─────────
alter table public.applications enable row level security;

create policy applications_owner_sel on public.applications
  for select using (user_id = auth.uid() or public.is_admin());
create policy applications_owner_ins on public.applications
  for insert with check (user_id = auth.uid());
create policy applications_owner_upd on public.applications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy applications_owner_del on public.applications
  for delete using (user_id = auth.uid());
