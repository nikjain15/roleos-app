-- ── index_ask_events — anon rate-limit log for /api/index/ask ───────────────
-- The public "Ask RO about the Index" endpoint is unauthenticated and calls
-- Claude, so it needs an IP rate limit (cost + abuse). One row per request; the
-- route counts a rolling window per IP before answering. Service-role only.
create table if not exists public.index_ask_events (
  id         bigint generated always as identity primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index if not exists index_ask_events_ip_time_idx
  on public.index_ask_events (ip, created_at desc);

alter table public.index_ask_events enable row level security;  -- no policy = deny to clients
