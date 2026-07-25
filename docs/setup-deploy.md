# Deploy RoleOS to Cloudflare (prod)

Status: **LIVE at [ro.roleos.fyi](https://ro.roleos.fyi)** (OpenNext on Cloudflare
Workers, custom domain on the `ro` subdomain - the apex `roleos.fyi` serves the
separate marketing site). This doc is the **re-deploy runbook** - the checklist
and gotchas below are what to run for each subsequent deploy.

The app is **all-Cloudflare** via `@opennextjs/cloudflare`. The Supabase data
layer is live. The build-studio **sandbox** is a *separate* worker
(`sandbox/studio`) - deploy it only if/when you want live prototype previews in
prod (it needs CF Containers, which bills); without it the prototype canvas runs
in graceful offline mode (code shown, no live preview).

---

## 0 · Zone (already done) - roleos.fyi on Cloudflare

The `roleos.fyi` zone is **active** on account `430f00d6622c766342f89a4e6a2261f6`
and the app's custom domain is bound to `ro.roleos.fyi`. Nothing to do here for a
re-deploy. (Historical: a Workers custom domain requires the domain be an active
zone on the same account - this was the one-time prerequisite before first deploy.)

---

## 1 · Set the prod secrets (one-time - already set)

Only two server secrets are needed - the public `NEXT_PUBLIC_*` values are inlined
into the bundle at build time, and Workers AI is a binding, not a secret.

```bash
# pulls each value from .dev.vars and pipes it to wrangler (no secret on a CLI arg).
# IMPORTANT: .dev.vars values are DOUBLE-QUOTED - strip the quotes, or Supabase/
# Anthropic get a key wrapped in literal quotes ("Invalid API key" at runtime).
# printf (not echo) avoids a trailing newline in the secret.
for S in ANTHROPIC_API_KEY SUPABASE_SERVICE_ROLE_KEY; do
  v=$(grep "^$S=" .dev.vars | cut -d= -f2-); v="${v%\"}"; v="${v#\"}"
  printf %s "$v" | npx wrangler secret put "$S"
done
```

`wrangler` is OAuth-authenticated (`wrangler whoami` → nikjain1588@gmail.com).
Do NOT set `CLOUDFLARE_API_TOKEN` as a prod secret - the Worker uses the AI
*binding*, not a token, and the `.dev.vars` token is a narrow dev one.

### Deploy auth trap - the narrow `CLOUDFLARE_API_TOKEN` (read this if a deploy 401s)
The `.dev.vars` `CLOUDFLARE_API_TOKEN` is a **dev-scoped** token (no Workers-deploy
permission). It must NOT reach a build/deploy or you get `Authentication error
[10000]` / `Failed to retrieve account IDs`. Two files leak it:
- **`.env.local`** - wrangler 4.x auto-loads it, and `next build` opens a remote
  AI session with it. **Keep `CLOUDFLARE_API_TOKEN` OUT of `.env.local`** (the file
  even says so). If it crept back, delete that one line.
- **`.dev.vars`** - `opennextjs-cloudflare deploy` sources it ("Using secrets
  defined in .dev.vars"). For the **app deploy**, temporarily strip the
  `CLOUDFLARE_API_TOKEN=` line, then restore after:
  ```bash
  cp .dev.vars /tmp/dv.bak
  grep -v '^CLOUDFLARE_API_TOKEN=' /tmp/dv.bak > .dev.vars
  export CLOUDFLARE_ACCOUNT_ID=430f00d6622c766342f89a4e6a2261f6  # OAuth can't list accounts
  npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy
  cp /tmp/dv.bak .dev.vars   # restore (Node scripts still want the token)
  ```
- **Ingest worker** (`ingest/wrangler.jsonc`): `--env-file` to an empty file
  sidesteps the `.env.local` load:
  `npx wrangler deploy -c ingest/wrangler.jsonc --env-file /tmp/empty.env`.

If wrangler OAuth has expired, `npx wrangler login` first (the OAuth session has
the Workers-deploy scope the `.dev.vars` token lacks).

---

## 2 · Custom domain (already bound)

`wrangler.jsonc` binds the app to the `ro` subdomain:

```jsonc
"routes": [{ "pattern": "ro.roleos.fyi", "custom_domain": true }]
```

Wrangler maintains the custom-domain record on deploy. The apex `roleos.fyi` is
left to the separate marketing site.

---

## 3 · Build + deploy

```bash
npm run deploy        # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

This builds `.open-next/worker.js` and deploys the `roleos` worker with the AI
binding, assets, and observability. First deploy may prompt to register a
`workers.dev` subdomain - fine to accept (the worker is reachable there too).

---

## 4 · Point Supabase auth at the prod origin (or magic-link / Google sign-in break)

Supabase must allow the prod origin as a redirect target and as `site_url`.
Update via the Management API with a Supabase **PAT** (same one used for
migrations - ask the user; never hardcode). Project ref `qaubhkrgcdllnqvtrccr`.

```bash
PAT=<supabase-pat>
curl -s -X PATCH "https://api.supabase.com/v1/projects/qaubhkrgcdllnqvtrccr/config/auth" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{
    "site_url": "https://ro.roleos.fyi",
    "uri_allow_list": "https://ro.roleos.fyi,https://ro.roleos.fyi/auth/callback,http://localhost:3000,http://localhost:3000/auth/callback"
  }'
```

(Keep localhost in the allow-list so dev still works.) This is already configured;
Google + LinkedIn + magic-link sign-in are all enabled. The Google Cloud OAuth
client's authorized redirect URIs include the Supabase callback.

---

## 5 · Smoke-test live

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ro.roleos.fyi/                 # 200
curl -s -o /dev/null -w "%{http_code}\n" https://ro.roleos.fyi/login            # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ro.roleos.fyi/api/build \
  -H 'content-type: application/json' -d '{"action":"start"}'                  # 401 (auth gate)
curl -s -o /dev/null -w "%{http_code}\n" https://ro.roleos.fyi/feed             # 307 -> /login
```

Then sign in with a magic link end-to-end and run one onboarding to confirm the
Anthropic + Supabase + Workers AI paths all work in prod.

---

## 6 · (Optional, later) live prototype previews in prod

Deploy the sandbox worker and point the app at it. **Bills CF Containers - only
when the prototype canvas proves out.**

```bash
cd sandbox/studio && npm install && npm run deploy
# then on the main app:
echo "<deployed-sandbox-worker-url>" | npx wrangler secret put SANDBOX_URL
npm run deploy
```

Without `SANDBOX_URL`, the prototype canvas stays in graceful offline mode.
