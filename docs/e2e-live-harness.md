# Live E2E harness, full-scenario testing across the D-dimensions

The fast smoke (`npm run test:e2e`, `playwright.config.ts`) only hits **public** pages
(no session, no secrets) so it runs in CI. The **live harness** (`tests/e2e/live/`,
`playwright.live.config.ts`) drives the **authenticated** app with real seeded users
against real Supabase (and, optionally, real models), covering the scenario library
that CI can't: personas, edge/negative states, cross-user RLS, prompt-injection, and
authed mobile a11y.

## Run it

```bash
# from ~/dev/roleos, with .env.local present (real Supabase URL/anon/service-role keys)
npm run test:e2e:live                 # persona + edge + RLS + authed a11y  (no model calls)
E2E_LIVE_MODEL=1 npm run test:e2e:live # + the prompt-injection test (spends real model calls)
```

It self-boots `next dev`, so nothing else needs to be running. Every spec **skips**
when secrets are absent (`hasSecrets`), so it's a no-op in CI and never flakes there.

## How it works

- `tests/e2e/live/seed.ts`, loads `.env.local`, creates a throwaway confirmed user
  via the service role, mints a real session (magiclink → `verifyOtp`), and forges the
  `sb-<ref>-auth-token` cookie. Seed helpers write realistic rows (master_profile,
  matches, goal, artifact, application). `cleanup()` deletes the user (cascades all rows).
- `tests/e2e/live/fixtures.ts`, `newUser` fixture (auto-cleans), `applyAuth` (injects
  the cookie into a browser context).

## What it covers (maps to AUDIT-DIMENSIONS)

| Spec | Dimension | Checks |
|---|---|---|
| `persona.spec.ts` | D2, D5, D7 | seed a senior-PM hunt → feed cockpit, roles, tracker, goal, résumé all render on real data; authed `/feed` at 375px has no h-overflow + passes axe |
| `edge.spec.ts` | D3 | 0 matches → honest empty state; sub-cycle deadline → Off-track + extend lever; flagged résumé → "needs your eyes" shown |
| `rls.spec.ts` | D6 | user A (signed in) is blocked from user B's résumé/apply/export/page → 404, B's data untouched |
| `injection.spec.ts` | D6 | a CV carrying "ignore instructions… CEO of Google" → RO **detects the injection and refuses** (no fabricated body); résumé body never echoes the fabrication (model-gated) |
| `a11y-sweep.spec.ts` | D5, D7 | **every** authed screen (feed/goal/roles/tracker/settings/watch/résumé/apply) at 375px → no h-overflow + 0 serious axe |
| `api-contract.spec.ts` | D6 | every mutating route: unauth → 401, secretless cron → 403, malformed body → 400 (never 500) |
| `flows.spec.ts` | D2 | goal→plan, tracker create→advance, curate dismiss, DOCX export, apply gesture (records send + advances), taste correction, asserting real DB state |
| `prod.spec.ts` | ops | opt-in prod health check (`npm run test:e2e:prod`), every authed surface on ro.roleos.fyi returns non-5xx |

## Findings from the first run (2026-07-03)

- ✅ **RLS holds:** cross-user probes all 404.
- ✅ **Prompt-injection is refused:** RO's truth gate flags the adversarial profile
  and generates no résumé. (Note: RO grounds against the user's *own* profile, so a
  false claim the user themselves supplies is trusted, RO guards against *inventing
  beyond* the profile, not against the user's own inputs.)
- 🐛 **Found + fixed:** the authed `/feed` overflowed 192px at 375px (an un-wrapped
  action-link row), the public-only smoke couldn't catch it. Fixed with `flex-wrap`.
- 🐛 **Found + fixed (coverage expansion):** `/watch` had unlabelled form inputs (the
  `Field` wrapper's `<label>` wasn't associated with its control), axe `label`
  violation. Fixed by wrapping the control in the `<label>`.
- ✅ Prod authed surfaces (ro.roleos.fyi) all return non-5xx (`npm run test:e2e:prod`).

## Still manual / not automated

Load/perf stress (many concurrent writers) and a broad multi-persona sweep across
*every* authed screen at 375px are follow-ups, the harness makes both easy to add.
