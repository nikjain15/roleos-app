-- ── google_tokens — Gate 2 (Flag C) Google API access ───────────────────────
-- Stores the Google OAuth REFRESH token captured at sign-in, so the server can
-- mint short-lived access tokens to read Gmail + Calendar (readonly) on demand.
-- Sensitive: RLS is enabled with NO policies → default-deny → ONLY the service
-- role (server) can read/write it. Never exposed to the browser.
create table if not exists public.google_tokens (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  refresh_token  text not null,
  scope          text,
  updated_at     timestamptz not null default now()
);

alter table public.google_tokens enable row level security;
-- (intentionally no policies — service-role only)
