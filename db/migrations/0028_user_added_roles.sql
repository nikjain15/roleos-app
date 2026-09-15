-- ── roles · user-added roles (paste a LinkedIn job) ────────────────────────
-- A user can bring their own role in (typically a LinkedIn posting) and tailor
-- against it. Ownership marker + privacy: a user-added role is visible ONLY to
-- the user who added it; corpus roles (added_by null) stay readable by all
-- authenticated users, as before.
--
-- Recall stays clean without touching match_roles / role_distances /
-- profile_distance_quantiles: user-added roles get NO role_embeddings row (the
-- user already chose the role — it never needs to be discovered), so every
-- embedding-driven path skips them by construction.

alter table public.roles
  add column if not exists added_by uuid references auth.users (id) on delete cascade;

create index if not exists roles_added_by_idx on public.roles (added_by);

drop policy if exists roles_read_all on public.roles;
create policy roles_read_all on public.roles
  for select to authenticated using (added_by is null or added_by = auth.uid());
