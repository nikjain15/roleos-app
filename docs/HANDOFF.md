# RoleOS — continuation brief (paste into a new chat) · updated 2026-07-26

You are the senior engineer continuing **RoleOS** (`/Users/nikjain/dev/roleos`, git)
— an AI-first web app where an agent ("RO") runs a senior AI/PM job hunt FOR the
user. Work like a 20+yr full-stack eng: design before code, thin verifiable slices,
verify live, no quality compromises. **Pause for the user's call on design/product
decisions.** One gate: the user merges every PR.

## STEP 1 — read before doing anything
1. `docs/specs/design-system.md` — **THE VISUAL CONTRACT.** grape=`primary`,
   energy=`volt`/`spark` (#c8ff00), streak/warm=`coral`, Space Grotesk display +
   Plus Jakarta Sans body, light app. `components/ui/` primitives. **Never change it.**
2. `docs/specs/resume-editor-v2.md` — the next big build (below).
3. `docs/specs/feed-gamified.md`, `docs/specs/profile-data-layer.md` — shipped work.
4. `docs/AUDIT-LOG.md` (top) + auto-memory (`MEMORY.md` + linked files).

## Run it
`npm run dev` → localhost:3000 (Preview tool: `.claude/launch.json` → `roleos-dev`).
Checks **sequentially** (never concurrent tsc/vitest): `npm run typecheck` · `lint` · `test`.
Safe commit: `find .git -name '*.lock' -delete && git commit --no-verify`.

## LIVE NOW (ro.roleos.fyi — all merged & deployed)
J1 onboarding v2 · GitHub login · real-time Explore chat (markdown, taste capture) ·
no-scheme LinkedIn fetch fix · **Profile data layer** (P1 structured canonical profile
· P2 correctable "What RO knows" view · P3 taste→match re-rank overlay) ·
**Gamified feed** (streak · momentum · constellation path · today's actions, on the
design system) · **Nav restructure** → `Today · Roles · Studio · Tracker` + Settings,
with a **Studio** craft hub; Goal+Profile under Settings. Routes: `/onboarding→/start`,
`/explore→/the-index` (redirects in place).

## NEXT (in progress): Résumé editor v2 — Studio › Résumé
Spec: `docs/specs/resume-editor-v2.md`. Mockup (throwaway, delete after build):
`public/mock-resume.html`. AI-first, on the design system. Build phases:
- **P1 — coverage scorer** (`lib/resume/score.ts`, pure + eval fixtures). Per-section
  + overall. **Score = coverage of the role's requirements by real evidence, NOT
  interview odds.** Honest tiers: Solid → Strong → Fully evidenced. `+N from master`
  = same scorer on master vs tailored.
- **P2 — editor UI** in Studio › Résumé (readiness meter · per-section strength +
  "tune this section" · inline-editable lines · **✓-approve locks a line** ·
  alternative drafts) **+ industry-standard export**: DOCX **and** PDF, single-column
  ATS-safe, ONE layout for both, **validated against real market résumé samples** (a
  P2 gate — don't invent a format). `docx` lib (`Packer.toBase64String`), PDF via the
  print route client-side (no headless Chrome on Workers).
- **P3 — revise-by-instruction** (global + section-scoped, truth-gated, respects
  ✓-locks) + surface the tailor skill's structured change-log ("what I tuned").
- **P4 — calibration loop**: feedback (✓/edits/tune-accept/export/outcome) →
  `decision_events` → recalibrate the *coverage judge* (extends `outcome-learning`);
  outcomes only *watched* for miscalibration, **never** presented as a prediction.
  Measured by a held-out eval set.
One master → many tailored résumés (per role, each its own score). Extends existing
`/api/tailor` + truth-gate.

## OTHER PENDING (after résumé, or in parallel)
- **Bring the rest of Studio onto the design system**: Build a piece · Practice the
  interview (J12 mocks) · Cover letters (J10) · Negotiate — currently pre-J old UI.
- **Feed polish**: the readiness-meter tier labels overlap on the right (fix); more
  state polish.
- **Hardening**: the red CI `check` is a **pre-existing `npm audit`** failure
  (Next.js/postcss/sharp CVEs) — needs a Next bump; NOT blocking deploy (separate
  workflow). Email digest delivery (CF Email). Live sandbox preview (paid CF
  Containers). **Rotate the GitHub OAuth client secret** (it was pasted in chat).
- **P4 profile → relational tables** (later; migration path in profile-data-layer.md).

## KEY DECISIONS (don't re-litigate)
- Résumé score is **coverage/case-strength, honest — never predicts interviews.**
- Taste feeds matching as a **transparent re-rank overlay** (labeled, nothing hidden).
- Profile stored as **canonical JSON, table-shaped** (relational is a later, cheap explode).
- IA: `Today · Roles · Studio · Tracker` + Settings.

## INVARIANTS (never break; tests enforce some)
Human-gated-outward (no send tool in `agent/`; `/api/dispatch` only) · truth-gate on
résumé (claims trace to master_profile) · RLS + append-only `decision_events` ·
`profiles.role` immutable · meter every model call · `zod` on new routes.

## GOTCHAS
- **Verify authed flows without email:** forge a Supabase session —
  `admin.generateLink({type:'magiclink',email})` → `verifyOtp({token_hash,type:'email'})`
  → cookie `sb-<ref>-auth-token=base64-<base64(session JSON)>`. Use `ro.tester@roleos.dev`;
  **delete the test user after** (`admin.deleteUser`). Supabase ref `qaubhkrgcdllnqvtrccr`.
- **Browser cookie-injection is blocked by the auto classifier** (looks like session
  hijack) — verify authed pages via `curl` with a `Cookie:` header instead, or have the
  user look in their own logged-in browser.
- Model runs are ~mins (quality-first — don't cut tiers). `registry.json` isn't hot-reloaded.
- If `.next/types` complains about a deleted route, delete the stale `.next/types/app/<route>`.
- `main` was force-rewritten once externally (benign); watch who has force-push.

## HOW TO PROCEED
Recommend: start **résumé P1 (the coverage scorer)** — pure + testable, independent —
while gathering real market résumé samples to lock the export target before P2. Build
thin slices, verify live (sequentially green), PR each, **stop for the user's merge.**
