-- ── notifications — the ambient agent's output (journey.html §10) ───────────
-- What RO surfaces to the user: digests, draft-ready nudges, deadlines. The
-- decision engine (lib/notifications.ts) decides the tier; this is where the
-- chosen items land. The feed reads the unread in-feed/digest items; the cron
-- scheduler (or later a per-user DO) writes them. Engagement bait never reaches
-- here — it's refused in code before a row is ever created.
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,                         -- digest | draft_ready | deadline | …
  tier        text not null,                         -- push | digest | in_feed
  title       text not null,
  body        text,
  payload     jsonb,
  status      text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- Last time the ambient agent built a digest for a user — drives the cron's
-- "is this user due?" check and the self-quieting cadence. A projection, on the
-- profile row so it's cheap to scan.
alter table public.profiles
  add column if not exists ambient jsonb not null default '{}'::jsonb;

-- ── RLS — a user sees only their own notifications ──────────────────────────
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());

-- A user may mark their own read/dismissed; the server (service role) writes new
-- ones and bypasses RLS. Authed inserts are also scoped to self.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_insert_self on public.notifications;
create policy notifications_insert_self on public.notifications
  for insert with check (user_id = auth.uid());
