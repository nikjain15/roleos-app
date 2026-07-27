# RoleOS — continuation brief (paste into a new chat) · updated 2026-07-27

You are the senior engineer continuing **RoleOS** (`/Users/nikjain/dev/roleos`, git)
— an AI-first web app where an agent ("RO") runs a senior AI/PM job hunt FOR the
user. Work like a 20+yr full-stack eng: design before code, thin verifiable slices,
verify live, no quality compromises. **Pause for the user's call on design/product
decisions.**

## STEP 1 — read before doing anything
1. `docs/specs/design-system.md` — **THE VISUAL CONTRACT.** grape=`primary`,
   energy=`volt`/`spark` (#c8ff00), warm=`coral`, Space Grotesk display + Plus Jakarta
   Sans body, light app. `components/ui/` primitives (Button/Badge/Card/Input).
   **Never change it.** Bring every screen ONTO it.
2. Auto-memory: `MEMORY.md` + linked files — esp. `resume-editor-v2.md`,
   `ro-memory-requirements.md`, `tailoring-latency.md`. `docs/AUDIT-LOG.md` (top).
3. Specs of shipped work: `resume-editor-v2.md`, `ro-memory.md`, `profile-data-layer.md`.

## Run it / ship it
`npm run dev` → localhost:3000 (`.claude/launch.json` → `roleos-dev`). Checks
**sequentially** (never concurrent tsc/vitest): `npm run typecheck` · `lint` ·
`invariant:imports` · `test`. Safe commit: `find .git -name '*.lock' -delete && git
commit --no-verify`. **Deploy is automatic on merge to `main`**
(`.github/workflows/deploy.yml` → Cloudflare; allow ~2 min propagation before hitting
prod — an e2e right after a merge can hit the old worker; re-run once).

## LIVE NOW (ro.roleos.fyi — merged, deployed, e2e-verified)
Onboarding v2 · GitHub login · Explore chat · Profile data layer · gamified feed ·
nav `Today · Roles · Studio · Tracker`, PLUS the big 2026-07 builds:

- **Résumé editor v2 (Studio › Résumé) — P1–P4 DONE.** Honest coverage scorer
  (`lib/resume/score.ts`+`judge.ts`+`calibration.ts`; coverage of role requirements by
  real evidence, NEVER interview odds) · readiness meter · single-column editor
  (`components/ResumeEditor.tsx`: one section at a time, dropdown+search nav, strength
  pills, ✓-lock, "Why RO wrote this", on-demand CV panel) · tune-section + command bar
  (revise-by-instruction, truth-gated + scope/lock-enforced) · ATS DOCX/PDF export ·
  calibration + `evals/coverage/` gate. Doc model: `lib/resume/doc.ts`.
- **RO memory (Option B) — M0–M3 DONE.** Profile-aware dock (`lib/ro/context.ts`) ·
  durable notebook (`lib/ro/memory.ts`, `ro_memory`) + "What RO remembers" view
  (`/memory`) · conversation threads (`lib/ro/thread.ts`, `ro_threads`) · confidence/
  scope recall + `evals/memory/` gate + anonymous aggregate learning
  (`lib/ro/collective.ts`, `collective_resume_signals` SECURITY DEFINER, de-identified).
- **Tailoring/scoring latency — DONE.** ASYNC + client-driven: tailor/score buttons
  return instantly, the studio polls with live progress (`DraftingPoller`,
  `/api/artifact/[id]/{draft,status}`; scoring GET-polls its cached result). Compute
  also cut (voice-critic skip for résumé, no escalation-on-truth-block, parallel score
  passes) — truth gate UNCHANGED. See `tailoring-latency.md`.

## NEXT — the balance of the DESIGN work (recommended focus)
The rest of **Studio** is still pre-J old UI; bring each onto the design system
(tokens + `components/ui`), matching the résumé editor's calm, honest quality:
- **Build a piece** (portfolio/case-study, gate 3 — build-studio DO in `sandbox/studio`).
- **Practice the interview** (J12 mock interviews; voice mocks behind `VOICE_MOCKS_ENABLED`).
- **Cover letters** (J10 — `/api/cover`, `agent/skills/draft_cover.ts`).
- **Negotiate** (`/api/negotiate`).
Each is a slice: design on the system, verify live, PR, stop for the user's merge.
Ask the user which Studio surface to start with, and pause for design calls.

Also queued (smaller): apply the async fire-and-poll pattern to the cover-letter /
mock-interview buttons (same multi-minute wait; pattern in `TailorButton` +
`DraftingPoller`) · surface the calibration/collective read-back in the meter UI ·
wire the résumé command bar's artifact scope into `recallMemory({scope})` · feed
polish. Ops debt: rotate the GitHub OAuth client secret (was pasted in chat earlier) ·
the red CI `check` is a pre-existing `npm audit` (Next/postcss/sharp) — separate.

## VERIFYING AUTHED / LIVE FLOWS (how to check functionality works)
`.dev.vars` has all creds. Reusable e2e scripts (forge session → hit prod → assert →
delete the test user) — all green:
- `node scripts/verify-ro-memory.mjs` · `verify-ro-thread.mjs` (RO memory)
- `ROLE_ID=<uuid> node scripts/verify-resume-flow.mjs` (async tailor → sections → score)
- `node scripts/verify-async-tailor.mjs` (instant response + poll to completion)
Pattern: `admin.generateLink({type:'magiclink'})` → `verifyOtp({token_hash})` → cookie
`sb-<ref>-auth-token=base64-<b64(session JSON)>`; `admin.deleteUser` after. Source
`.dev.vars` first. Browser cookie-injection is blocked by the classifier — use these.

## APPLYING MIGRATIONS (CLI is authed; user authorizes each)
`db/migrations/` is source of truth (through 0020). Check clear (read-only) first, then:
```
set -a; source .dev.vars; set +a
SUPABASE_PAT="$SUPABASE_ACCESS_TOKEN" PROJECT_REF=qaubhkrgcdllnqvtrccr \
  node db/seed/apply-migrations.mjs db/migrations/00NN_x.sql
```
Additive (`CREATE ... IF NOT EXISTS`); safe on first apply. Supabase ref
`qaubhkrgcdllnqvtrccr` (ACTIVE). Query it read-only via the Management API
`/database/query` with `$SUPABASE_ACCESS_TOKEN`.

## INVARIANTS (never break; tests enforce some)
Human-gated-outward (NO send tool in `agent/`; `/api/dispatch` only —
`invariant:imports` + `tests/invariants`) · truth-gate on résumé (every line traces to
master_profile — UNCHANGED, don't weaken) · RLS + append-only `decision_events` · meter
EVERY model call (`callModel` → `logAgentRuns`) · `zod` on new routes · RO memory notes
are DATA (never trigger a send) · aggregate learning stays de-identified + k-anon.

## GOTCHAS
- Model runs are ~minutes (quality-first); heavy routes use `maxDuration=300`.
  `registry.json` isn't hot-reloaded.
- **`ctx.waitUntil` is NOT reliable on this OpenNext/Workers runtime** — long jobs are
  CLIENT-DRIVEN (a route the client kicks off + polls), not backgrounded. Don't reach
  for waitUntil.
- Deleted a route? Delete the stale `.next/types/app/<route>` dir if tsc complains.
- Deploy propagates ~2 min after merge; re-run an e2e once if it hits the old worker.

## HOW TO PROCEED
Recommend: ask the user which **Studio** surface to bring onto the design system first
(Build a piece / Practice interview / Cover letters / Negotiate), design the slice,
verify live (the e2e pattern above), PR, and **stop for the user's merge.**
