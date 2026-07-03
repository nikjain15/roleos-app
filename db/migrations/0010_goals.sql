-- ── goals ◆ — the spine: "get X in Y days" (architecture-buildplan §1) ──────
-- A first-class Goal drives sourcing, ranking, pace and agenda. One ACTIVE goal
-- per user carries a full plan; others are savable/switchable alternates. The
-- computed pace/funnel snapshot is cached on `plan` (nightly recompute + on goal
-- change; computed-on-read is the fallback). user-own RLS, mirroring §3.3.
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  target        jsonb not null default '{}'::jsonb,   -- {archetype, seniority, comp_floor, company_type, location, remote, domains}
  deadline_date date,
  deadline_hard boolean not null default false,        -- hard date vs soft aim
  constraints   jsonb,                                 -- {visa, dealbreakers[], must_haves[]}
  intensity     jsonb,                                 -- {hours_per_week, apps_per_week_ceiling}
  also_open_to  jsonb,                                 -- widen sourcing, no own pace
  status        text not null default 'active'
                  check (status in ('active','paused','archived','achieved')),
  plan          jsonb,                                 -- cached pace/funnel snapshot (lib/plan)
  computed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists goals_user_idx on public.goals (user_id, status);

-- At most ONE active goal per user (v1: one planned goal + "also open to").
create unique index if not exists goals_one_active_per_user
  on public.goals (user_id) where (status = 'active');

-- ── RLS: user-own (default deny; owner sel/ins/upd; admins read) ─────────────
alter table public.goals enable row level security;

create policy goals_owner_sel on public.goals
  for select using (user_id = auth.uid() or public.is_admin());
create policy goals_owner_ins on public.goals
  for insert with check (user_id = auth.uid());
create policy goals_owner_upd on public.goals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_owner_del on public.goals
  for delete using (user_id = auth.uid());
