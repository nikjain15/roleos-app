# Runbook — secret rotation

> **Rotation is a HUMAN action (hard-stop).** Keys have historically been shared in chat, so
> every one of them should be rotated before real go-live. This runbook is the exact recipe;
> the loop never executes it. Order matters — rotate, deploy, then verify with the checks below.

## Where secrets live

| Location | What | Notes |
|---|---|---|
| `.dev.vars` (local, gitignored) | all server secrets for local dev | values are double-quoted — strip quotes before `wrangler secret put` |
| `.env.local` (local, gitignored) | Supabase URL + anon + service-role for local/live-E2E | never add `CLOUDFLARE_API_TOKEN` here (deploy-token trap) |
| Cloudflare Worker secrets | prod runtime (`wrangler secret put NAME`) | `wrangler secret list` to inventory |
| GitHub Actions secrets | CI e2e job (public keys) + deploy | repo → Settings → Secrets |

## Per-secret recipes

### 1 · Supabase service-role key (highest blast radius)
1. Supabase dashboard → Settings → API → *Rotate* the `service_role` key.
2. Update: `.dev.vars`, `.env.local`, `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`.
3. Verify: `curl -s https://ro.roleos.fyi/api/health` → `{"ok":true}`; run `npm run test:e2e:live` locally.
4. The OLD key is dead the moment you rotate — do steps 2–3 immediately (brief write-path outage otherwise).

### 2 · Supabase anon key
Rotates together with the service key on Supabase ("JWT secret" rotation rotates BOTH). Update
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, Worker secret, and GitHub Actions, then redeploy
(the anon key is baked into the client bundle at build time).

### 3 · Anthropic API key
1. console.anthropic.com → API keys → create new, then disable the old one.
2. `.dev.vars` + `wrangler secret put ANTHROPIC_API_KEY`.
3. Verify: any dock ask on prod answers; `agent_runs` gets a fresh row.

### 4 · Cloudflare API token (Workers AI REST fallback + Supabase embeddings scripts)
1. CF dashboard → My Profile → API Tokens → roll the token (scope: Workers AI read/run only).
2. `.dev.vars` only. **Never** in `.env.local`; strip from `.dev.vars` before any `opennextjs-cloudflare deploy` (auth error 10000 trap — see docs/setup-deploy.md).

### 5 · CRON_SECRET
1. Generate: `openssl rand -hex 32`.
2. `wrangler secret put CRON_SECRET` + `.dev.vars`; update the Cloudflare cron trigger config if it passes the header.
3. Verify: `POST /api/cron/nudges` without the header → 403; with the new header → 200.

### 6 · Google OAuth client secret
1. Google Cloud console → Credentials → rotate client secret (keep the same client ID).
2. `.dev.vars` + Worker secret + the Supabase Auth Google provider config.
3. Verify: Google login round-trips on prod.

### 7 · Apify token
1. Apify console → Integrations → rotate.
2. `.dev.vars` + Worker secret. Verify: onboarding with a LinkedIn URL still fetches (or degrades honestly).

### 8 · Supabase access token (management API — used by the loop to apply migrations)
1. supabase.com/dashboard/account/tokens → revoke + create.
2. `.dev.vars` only. Verify: `curl -s -H "Authorization: Bearer <new>" https://api.supabase.com/v1/projects | head -c 100`.

## After ANY rotation
- `curl -s https://ro.roleos.fyi/api/health` → 200 `{"ok":true}`.
- Run `npm run test:e2e:prod` (smokes every authed surface against prod).
- Check Workers Logs for `rate_limit.degraded` / auth errors in the first minutes.
