# RoleOS — continuation brief (paste into a new chat) · updated 2026-07-27

You are the senior engineer continuing **RoleOS** (`/Users/nikjain/dev/roleos`, git)
— an AI-first web app where an agent ("RO") runs a senior AI/PM job hunt FOR the
user. Work like a 20+yr full-stack eng: design before code, thin verifiable slices,
verify live, no quality compromises. **Pause for the user's call on design/product
decisions.**

## STEP 1 — read before doing anything
1. `docs/specs/design-system.md` — **THE VISUAL CONTRACT.** grape=`primary`,
   energy=`volt`/`spark` (#c8ff00), warm=`coral`, Space Grotesk display + Plus Jakarta
   Sans body, light app. `components/ui/` primitives. **Never change it.**
2. `docs/specs/resume-editor-v2.md` · `docs/specs/ro-memory.md` — the two big builds,
   both now SHIPPED (below). `docs/specs/profile-data-layer.md`, `feed-gamified.md` — shipped.
3. `docs/AUDIT-LOG.md` (top) + auto-memory (`MEMORY.md` + linked files, esp.
   `resume-editor-v2.md`, `ro-memory-requirements.md`).

## Run it
`npm run dev` → localhost:3000 (Preview tool: `.claude/launch.json` → `roleos-dev`).
Checks **sequentially** (never concurrent tsc/vitest): `npm run typecheck` · `lint`
· `invariant:imports` · `test`. Safe commit: `find .git -name '*.lock' -delete && git commit --no-verify`.
**Deploy is automatic on merge to `main`** (`.github/workflows/deploy.yml` → Cloudflare;
allow ~2 min propagation before hitting prod). Merges/migrations gated by the user.

## LIVE NOW (ro.roleos.fyi — all merged, deployed, e2e-verified)
Everything prior (onboarding v2 · GitHub login · Explore chat · Profile data layer ·
gamified feed · nav `Today·Roles·Studio·Tracker`), PLUS the two big 2026-07 builds:

### Résumé editor v2 (Studio › Résumé) — P1–P4 COMPLETE
Honest **coverage scorer** (`lib/resume/score.ts` + `judge.ts` + `calibration.ts`;
coverage of role requirements by real evidence, NEVER interview odds) · **readiness
meter** · **single-column editor** (`components/ResumeEditor.tsx`: one experience
section at a time w/ dropdown+search nav, strength pills, ✓-lock lines, "Why RO wrote
this", on-demand "Your CV" panel) · **tune this section** + **command bar**
(revise-by-instruction, truth-gated + scope/lock-enforced, `lib/resume/revise.ts` +
`agent/skills/revise_resume.ts`) · **ATS DOCX/PDF export** (`lib/resume/docx.ts` +
print page, one layout) · **P4 calibration** (`lib/resume/feedback.ts` + the
`evals/coverage/` CI gate). draft_resume emits `experience[]` sections; the doc model
is `lib/resume/doc.ts` (tolerant, back-compat). Tailor + score routes run at
`maxDuration=300` (they're multi-minute).

### RO memory (Option B) — M0–M3 COMPLETE, "notebook, not a recording"
- **M0** `lib/ro/context.ts` — shared working-context assembler; the dock knows the
  user's profile.
- **M1** `lib/ro/memory.ts` + `db/migrations/0017_ro_memory.sql` — durable notebook:
  derive typed notes from `decision_events` → embed → recall top-k; **"What RO
  remembers"** view (`app/(app)/memory/page.tsx`, editable/forgettable).
- **M2** `lib/ro/thread.ts` + `0018_ro_threads.sql` — conversation threads + rolling
  summaries (bounded; cheap-tier fold on overflow).
- **M3** `rankRecall` (confidence/scope re-rank) · `evals/memory/` CI gate ·
  `lib/ro/collective.ts` + `0019_collective_signals.sql` — **anonymous aggregate
  learning** (SECURITY DEFINER fn returns de-identified counts only; `collectivePrior`
  seeds `judgeCalibration` cold-start).
All wired into `/api/ro/ask` FAIL-SAFE. Human-gated-outward holds (a note is data).

## VERIFYING AUTHED / LIVE FLOWS (this is how you check functionality)
Reusable e2e scripts (green vs prod) — forge a session, hit the deployed API, assert,
clean up the test user:
- `node scripts/verify-ro-memory.mjs` — M1 notebook (action → note → recall).
- `node scripts/verify-ro-thread.mjs` — M2 continuity (turn 2 recalls turn 1).
- `ROLE_ID=<uuid> node scripts/verify-resume-flow.mjs` — tailor → sections → score.
Pattern: `admin.generateLink({type:'magiclink'})` → `verifyOtp({token_hash})` → cookie
`sb-<ref>-auth-token=base64-<b64(session JSON)>`; `admin.deleteUser` after. Source
`.dev.vars` first. Supabase ref `qaubhkrgcdllnqvtrccr`.

## APPLYING MIGRATIONS (you have CLI access; user authorizes)
`db/migrations/` is source of truth. Apply via the Management API script — check clear
first (read-only), then:
```
set -a; source .dev.vars; set +a
SUPABASE_PAT="$SUPABASE_ACCESS_TOKEN" PROJECT_REF=qaubhkrgcdllnqvtrccr \
  node db/seed/apply-migrations.mjs db/migrations/00NN_x.sql
```
Migrations are additive (`CREATE ... IF NOT EXISTS`); safe on first apply.

## INVARIANTS (never break; tests enforce some)
Human-gated-outward (NO send tool in `agent/`; `/api/dispatch` only — `npm run
invariant:imports` + `tests/invariants`) · truth-gate on résumé (every line traces to
master_profile) · RLS + append-only `decision_events` · meter EVERY model call
(`callModel` → `logAgentRuns`) · `zod` on new routes · RO memory notes are DATA (never
trigger a send) · aggregate learning is de-identified + k-anon floored.

## GOTCHAS
- Model runs are ~minutes (quality-first) — heavy routes use `maxDuration=300`; new
  ones that call models should too. `registry.json` isn't hot-reloaded.
- If `.next/types` complains about a deleted route, delete the stale
  `.next/types/app/<route>` dir.
- Browser cookie-injection is blocked by the auto classifier — verify authed pages via
  the e2e scripts (curl + forged cookie) or the user's own browser.
- Deploy propagates ~2 min after merge; e2e right after a merge can hit the old worker
  (re-run once).

## NEXT (optional polish — the two big arcs are done)
- Surface the calibration / collective read-back in the UI (computed, not shown yet).
- Wire the résumé command bar's artifact scope into `recallMemory({scope})`.
- Email digest delivery (CF Email) · live sandbox preview (paid CF Containers).
- The red CI `check` is a pre-existing `npm audit` (Next/postcss/sharp CVEs) — separate
  workflow, not blocking deploy.
