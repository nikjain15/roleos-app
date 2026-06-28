-- ── intents · "keep me in the loop" watch fields ────────────────────────────
-- The user tells RO what they're hunting for; that becomes the demand signal
-- that (a) flips RO toward push mode and (b) drives demand-driven ingestion —
-- we fetch roles/companies people actually want, growing the corpus. Admin sees
-- the aggregate. Extends the existing intents row (target_role/location/comp
-- stay as the primary ask).
alter table public.intents
  add column if not exists keywords  text[] not null default '{}',   -- role titles / keywords
  add column if not exists companies text[] not null default '{}',   -- target companies
  add column if not exists notify    boolean not null default true,  -- keep me in the loop
  add column if not exists status    text not null default 'active'  -- active | paused
    check (status in ('active', 'paused')),
  add column if not exists updated_at timestamptz not null default now();

-- One active watch per user is the common case — let the app upsert on user_id.
create unique index if not exists intents_one_active_per_user
  on public.intents (user_id)
  where status = 'active';

-- A user may UPDATE their own intent (the base RLS only granted select/insert).
drop policy if exists intents_owner_upd on public.intents;
create policy intents_owner_upd on public.intents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
