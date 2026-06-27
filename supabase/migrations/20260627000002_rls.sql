-- RoleOS · 0002_rls · Row-Level Security — the real per-user boundary.
-- architecture.md §3.3. Default deny. user_id = auth.uid(). decision_events
-- insert-only. profiles.role immutable-by-user. roles read-only to all auth.

-- ── is_admin() helper ────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Enable RLS everywhere. No policy = no access (default deny).
alter table public.profiles        enable row level security;
alter table public.master_profile  enable row level security;
alter table public.intents         enable row level security;
alter table public.roles           enable row level security;
alter table public.role_embeddings enable row level security;
alter table public.matches         enable row level security;
alter table public.decision_events enable row level security;
alter table public.taste_model     enable row level security;
alter table public.artifacts       enable row level security;
alter table public.pipeline        enable row level security;
alter table public.agent_runs      enable row level security;

-- ── profiles ─────────────────────────────────────────────────────────────
-- Read/update own row; admins read all. role column guarded by trigger below.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

-- A user may not change their own role; only the service role / an admin may.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() is null for the service role (seed/admin paths) → allowed.
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'role is not user-modifiable';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ── helper: a standard owner policy on user-owned tables ─────────────────
-- (select + insert + update for the owner; admins get parallel read.)
do $$
declare t text;
begin
  foreach t in array array[
    'master_profile','intents','matches','taste_model','artifacts','pipeline'
  ] loop
    execute format(
      'create policy %1$s_owner_sel on public.%1$s for select using (user_id = auth.uid() or public.is_admin());',
      t);
    execute format(
      'create policy %1$s_owner_ins on public.%1$s for insert with check (user_id = auth.uid());',
      t);
    execute format(
      'create policy %1$s_owner_upd on public.%1$s for update using (user_id = auth.uid()) with check (user_id = auth.uid());',
      t);
  end loop;
end $$;

-- ── decision_events — INSERT-ONLY for users (keeps the log append-only) ──
-- No update/delete policy exists → those are denied. Corrections are new
-- high-weight rows, never edits.
create policy decision_events_sel on public.decision_events
  for select using (user_id = auth.uid() or public.is_admin());
create policy decision_events_ins on public.decision_events
  for insert with check (user_id = auth.uid());

-- ── roles + role_embeddings — read-only to all authenticated users ───────
-- Writes restricted to the service role (seed/ingestion), which bypasses RLS.
create policy roles_read_all on public.roles
  for select to authenticated using (true);
create policy role_embeddings_read_all on public.role_embeddings
  for select to authenticated using (true);

-- ── agent_runs — admin-only read; no user write path (service role logs) ─
create policy agent_runs_admin_sel on public.agent_runs
  for select using (public.is_admin());
