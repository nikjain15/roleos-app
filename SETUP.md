# RoleOS — live setup runbook (Phase 1 → Phase 2 handoff)

Everything in the repo is built and tested. To bring it alive we need a few
secrets and to run a handful of commands. Cloudflare is already logged in
(`wrangler whoami` → nikjain1588@gmail.com); the Supabase CLI is authenticated.

## What's blocked on you

1. **Unpause (or create) the Supabase project.** The existing `RoleOS` project
   (`qaubhkrgcdllnqvtrccr`, West US Oregon) is **paused**. Either unpause it at
   https://supabase.com/dashboard/project/qaubhkrgcdllnqvtrccr **or** create a
   fresh project (architecture.md prefers a clean one). Tell me which.
2. **Three secrets** (paste them to me, or put them in `roleos/.dev.vars` —
   gitignored — copying from `.dev.vars.example`):
   - `ANTHROPIC_API_KEY` — for the skills + quality gate.
   - Supabase project's `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` (dashboard → Project Settings → API).
   - `CLOUDFLARE_ACCOUNT_ID` (=`430f00d6622c766342f89a4e6a2261f6`) +
     `CLOUDFLARE_API_TOKEN` (token with **Workers AI → Read**) — for the
     embedding seed.

## The commands (I run these once the above exist)

```bash
# 1 · apply schema + RLS + auth to the live DB
supabase link --project-ref <ref>      # asks for the DB password once
supabase db push                        # applies the 3 migrations

# 2 · load the 557 roles
npm run seed:roles                       # needs SUPABASE_* env
npm run seed:embeddings                  # needs SUPABASE_* + CLOUDFLARE_* env

# 3 · configure auth in the dashboard (no passwords)
#    Authentication → Providers → Google (OAuth + Gmail/Calendar scopes) + Email magic link
#    (see db/README.md for the exact scopes + the Google verification note)

# 4 · run it locally
npm run dev
```

## Why each secret is server-only

`ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` never reach the browser
(architecture.md §8). The anon key + URL are safe to expose (RLS protects them).
