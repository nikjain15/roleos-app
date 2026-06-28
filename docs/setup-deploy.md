# Deploy RoleOS to Cloudflare (prod)

Status as of 2026-06-27: **deploy-ready, paused on one prerequisite** — `roleos.fyi`
is not yet a Cloudflare zone. The OpenNext prod build is green and the built
worker boots + serves correctly in workerd (landing 200, `/api/build` 401,
`/feed` 307 — auth + middleware intact). Once the domain is on Cloudflare, the
live deploy is the short checklist below.

The app is **all-Cloudflare** via `@opennextjs/cloudflare`. The Supabase data
layer is already live. The build-studio **sandbox** is a *separate* worker
(`sandbox/studio`) — deploy it only if/when you want live prototype previews in
prod (it needs CF Containers, which bills); without it the prototype canvas runs
in graceful offline mode (code shown, no live preview).

---

## 0 · Prerequisite (the current blocker) — add roleos.fyi to Cloudflare

A Workers **custom domain** can only bind to a domain that is an active **zone**
on the same Cloudflare account (`430f00d6622c766342f89a4e6a2261f6`). Today the
account has **zero zones**.

1. Cloudflare dashboard → **Add a site** → `roleos.fyi`.
2. Point the registrar's **nameservers** at the two Cloudflare assigns.
3. Wait for the zone status to go **Active** (minutes to a few hours).

Verify it's active before deploying:

```bash
set -a; . ./.dev.vars; set +a
curl -s "https://api.cloudflare.com/client/v4/zones?name=roleos.fyi" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '[.result[]|{name,status}]'
# expect: [{"name":"roleos.fyi","status":"active"}]
```

---

## 1 · Set the prod secrets (one-time)

Only two server secrets are needed — the public `NEXT_PUBLIC_*` values are inlined
into the bundle at build time, and Workers AI is a binding, not a secret.

```bash
# pulls each value from .dev.vars and pipes it to wrangler (no secret on a CLI arg).
# IMPORTANT: .dev.vars values are DOUBLE-QUOTED — strip the quotes, or Supabase/
# Anthropic get a key wrapped in literal quotes ("Invalid API key" at runtime).
# printf (not echo) avoids a trailing newline in the secret.
for S in ANTHROPIC_API_KEY SUPABASE_SERVICE_ROLE_KEY; do
  v=$(grep "^$S=" .dev.vars | cut -d= -f2-); v="${v%\"}"; v="${v#\"}"
  printf %s "$v" | npx wrangler secret put "$S"
done
```

`wrangler` is OAuth-authenticated (`wrangler whoami` → nikjain1588@gmail.com).
Do NOT set `CLOUDFLARE_API_TOKEN` as a prod secret — the Worker uses the AI
*binding*, not a token, and the `.dev.vars` token is a narrow dev one.

---

## 2 · Enable the custom domain

In `wrangler.jsonc`, uncomment the `routes` block (kept ready, commented, so the
repo stays deployable to workers.dev until the zone exists):

```jsonc
"routes": [{ "pattern": "roleos.fyi", "custom_domain": true }]
```

Wrangler creates the custom-domain record on deploy.

---

## 3 · Build + deploy

```bash
npm run deploy        # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

This builds `.open-next/worker.js` and deploys the `roleos` worker with the AI
binding, assets, and observability. First deploy may prompt to register a
`workers.dev` subdomain — fine to accept (the worker is reachable there too).

---

## 4 · Point Supabase auth at the prod origin (or magic-link / Google sign-in break)

Supabase must allow the prod origin as a redirect target and as `site_url`.
Update via the Management API with a Supabase **PAT** (same one used for
migrations — ask the user; never hardcode). Project ref `qaubhkrgcdllnqvtrccr`.

```bash
PAT=<supabase-pat>
curl -s -X PATCH "https://api.supabase.com/v1/projects/qaubhkrgcdllnqvtrccr/config/auth" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{
    "site_url": "https://roleos.fyi",
    "uri_allow_list": "https://roleos.fyi,https://roleos.fyi/auth/callback,http://localhost:3000,http://localhost:3000/auth/callback"
  }'
```

(Keep localhost in the allow-list so dev still works.) If Google sign-in is on,
also add `https://roleos.fyi/auth/callback` to the Google Cloud OAuth client's
authorized redirect URIs.

---

## 5 · Smoke-test live

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://roleos.fyi/                 # 200
curl -s -o /dev/null -w "%{http_code}\n" https://roleos.fyi/login            # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://roleos.fyi/api/build \
  -H 'content-type: application/json' -d '{"action":"start"}'                # 401 (auth gate)
curl -s -o /dev/null -w "%{http_code}\n" https://roleos.fyi/feed             # 307 -> /login
```

Then sign in with a magic link end-to-end and run one onboarding to confirm the
Anthropic + Supabase + Workers AI paths all work in prod.

---

## 6 · (Optional, later) live prototype previews in prod

Deploy the sandbox worker and point the app at it. **Bills CF Containers — only
when the prototype canvas proves out.**

```bash
cd sandbox/studio && npm install && npm run deploy
# then on the main app:
echo "<deployed-sandbox-worker-url>" | npx wrangler secret put SANDBOX_URL
npm run deploy
```

Without `SANDBOX_URL`, the prototype canvas stays in graceful offline mode.
