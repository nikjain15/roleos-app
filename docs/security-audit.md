# Phase 5 — security & RLS audit (2026-06-28)

A pass over the production app (`ro.roleos.fyi`). All checks **green**.

## RLS (the real per-tenant boundary) — verified live against the DB
All 13 public tables have RLS **enabled**, with the right policy shape:

| Table | Policies | Verdict |
|---|---|---|
| `master_profile`, `intents`, `matches`, `taste_model`, `artifacts`, `pipeline`, `notifications` | select/insert/update own (`user_id = auth.uid()`) | ✅ user-scoped |
| `profiles` | select/insert/update own **+ `profiles_role_guard` trigger** | ✅ role immutable by users |
| `decision_events` | **SELECT + INSERT only** (no update/delete) | ✅ append-only substrate |
| `roles`, `role_embeddings` | **SELECT only** | ✅ read-only to users (writes = service role) |
| `agent_runs` | **SELECT only** (admin policy) | ✅ admin-read, no user writes |
| `google_tokens` | **0 policies** (default-deny) | ✅ service-role-only (Gmail refresh tokens locked) |

## No server secret reaches the client
- Grepped the built client bundle (`.open-next/assets`, `.next/static`) for the
  **actual values** of the service-role key, Anthropic key, and Google client
  secret → **0 hits**. Only the RLS-safe anon key is inlined (expected).
- New invariant test `tests/invariants/no-client-secret-imports.test.ts` fails
  the build if any `"use client"` file imports a secret-bearing module — so it
  can't regress.

## Human-gated-outward (the core safety invariant) — intact
- `tests/invariants/no-send-tool.test.ts` (3 tests) green — agent tool registry
  has no send-capable tool.
- `.dependency-cruiser.cjs` green — nothing under `agent/` imports an outbound
  transport (31 modules cruised).
- `app/api/dispatch/route.ts` is still a **501 stub** — no live send path exists.
- Gate 2 recruiter replies are **you-send**: drafts open in the user's own Gmail
  compose URL; the server never sends. We hold only **read-only** Google scopes.

## SSRF / outbound surface
- The only server-side outbound fetches are to **fixed hosts**: `api.apify.com` /
  `api.brightdata.com` (scraper, user URL passed as a param, not fetched
  directly), `*.googleapis.com` (Gmail/Calendar read), `oauth2.googleapis.com`
  (token refresh), and the Anthropic API. No arbitrary user-controlled URL is
  fetched by the server. No SSRF.

## Secrets at rest
- `.dev.vars` is gitignored; no secret values are committed. Prod secrets live in
  `wrangler secret` (ANTHROPIC, SUPABASE_SERVICE_ROLE, GOOGLE_OAUTH_*, CRON_SECRET,
  APIFY_*). The cron worker holds only `CRON_SECRET`.

## Follow-ups (not blocking)
- **Rotate** the Google/LinkedIn client secrets + Supabase PAT that were pasted in
  chat during setup.
- **Accessibility:** baseline aria-labels added to the primary inputs; a full a11y
  pass (contrast ratios, keyboard nav, focus management, screen-reader testing) is
  a worthwhile dedicated effort.
- **Google verification** if Gate 2 is ever opened beyond the owner/test users.
