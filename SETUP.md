# RoleOS — local development & environment

The app is **built, deployed, and live at [ro.roleos.fyi](https://ro.roleos.fyi)**.
This doc covers running it locally. For production deploys see
[`docs/setup-deploy.md`](docs/setup-deploy.md); for the data layer see
[`db/README.md`](db/README.md).

## Prerequisites

- Node 20+, `wrangler` logged in (`wrangler login` — OAuth, has deploy scopes)
- The live Supabase project `qaubhkrgcdllnqvtrccr` (schema, RLS, auth, and the
  role corpus are already applied/seeded — no bring-up needed)

## Secrets (gitignored, already on disk)

Secrets live in `roleos/.dev.vars` (Worker/scripts) and `roleos/.env.local`
(Next dev). Both hold Anthropic + Supabase (url / anon / service_role) +
Cloudflare (account id `430f00d6622c766342f89a4e6a2261f6` + Workers AI token),
plus Google OAuth, Apify, and CRON/SANDBOX secrets.

> **`CLOUDFLARE_API_TOKEN` must NOT be in `.env.local`** — wrangler auto-loads
> that file and the token lacks dev/deploy perms, causing auth error 10000. Dev
> uses wrangler OAuth for the AI binding. See `docs/setup-deploy.md` for the
> deploy-time `.dev.vars` token-strip gotcha.

## Run it

```bash
cd roleos
npm run dev            # http://localhost:3000 (Preview: .claude/launch.json → roleos-dev)
```

## Checks (run SEQUENTIALLY — concurrency corrupts node_modules)

```bash
npm run test           # vitest (unit + invariants)
npm run typecheck      # tsc (~30–60s, be patient)
npm run lint
```

## Why secrets are server-only

`ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` never reach the browser
(enforced by `tests/invariants/no-client-secret-imports.test.ts`). The anon key
+ URL are safe to expose — RLS is the boundary.
