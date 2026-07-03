# Audit & Learnings Log

> Living record so quality compounds and nothing breaks at scale. The build loop
> **prepends** a dated entry per slice (newest first) and adds to **Standing learnings**
> whenever it discovers something the next slice should inherit. Read the top before every
> slice. See `docs/AUDIT-DIMENSIONS.md` for the dimensions and `docs/BUILD-LOOP.md` for the process.

## Regression guards (must stay green forever)

- **Human-gated outward** — no send tool in `agent/`; `tests/invariants/no-send-tool.test.ts`
  + `.dependency-cruiser.cjs`. `/api/apply` is the only send path (user-clicked).
- **No client secrets** — `tests/invariants/no-client-secret-imports.test.ts`.
- **Truth-gated résumé** — claims trace to master_profile; gate flags, never ships lies.
- **RLS on every user table** — default-deny; cross-user reads blocked. Test each new table.
- **decision_events append-only**; `profiles.role` immutable by users.
- **Every model call metered** to `agent_runs`.

## Standing learnings (inherit these — don't relearn)

- **Never run two `tsc`/`vitest` concurrently** in this repo — it hangs and can corrupt
  `node_modules` (fix: `npm ci`). Run checks **sequentially**. `npm run typecheck` exits 0
  silently on success; `tsc` takes ~30–60s — be patient, it's not hung.
- **Pre-commit hook (asset cache-bust) hangs** on this large repo and leaves stale
  `.git/*.lock`. For safe commits: `find .git -name '*.lock' -delete` then
  `git commit --no-verify` (the hook is irrelevant to non-asset changes).
- **Deploy token trap:** a narrow `CLOUDFLARE_API_TOKEN` in `.env.local`/`.dev.vars` breaks
  build/deploy (auth error 10000). Keep it out of `.env.local`; strip from `.dev.vars` for
  the app deploy; use `wrangler login` (OAuth) for deploy scopes. See `docs/setup-deploy.md`.
- **Secrets are double-quoted in `.dev.vars`** — strip quotes before `wrangler secret put`
  or the key ships wrapped in literal quotes ("Invalid API key" at runtime).
- **`registry.json` is a JSON import** — `next dev` does NOT hot-reload it; restart after edits.
- **Anthropic non-streaming refuses if `max_tokens` could exceed 10 min** (the code job uses
  16000, not 24000). Keep large generations streaming or ≤16000.
- **Structured skills can yield empty content** if the drafter's first JSON fails the shape
  check — the gate discarded it (fixed in slice 0 via `run.ts` shape-repair). Any new
  structured skill: give it an `expects` and never render a body-less artifact.
- **CI runs on PRs; deploy only on push to `main`** — so the PR-gated loop is safe. `zod` is
  installed but **no API route validates input yet** — add `zod` on every new route.
- **No headless Chrome on Workers** — PDF export must be client-side (or a later Browser-
  Rendering decision), not server-side on the Workers runtime.
- **Keep the checkout OUT of iCloud-synced `~/Documents`.** A fresh `node_modules` makes
  `fileproviderd` thrash (load avg 40+), hanging `npm`/`tsc`/`vitest`/`git` for many minutes.
  Work in `~/dev/roleos` (or any non-synced path). If a checkout is stuck in iCloud, don't `mv`
  it (iCloud materializes every evicted file — glacial); clone fresh outside the synced tree.
- **npm install can hang on global-cache lock contention** (e.g. alongside other `npm exec`
  processes). Fix: isolate the cache — `npm install --cache <scratch-dir> --no-audit --no-fund`.
- **Playwright/axe harness:** `npm run test:e2e` self-boots `next dev` and runs 375/768/1280 +
  axe (0 serious/critical). Needs `npx playwright install chromium` once. `/` (marketing) needs
  no secrets; routes behind auth need `.env.local` copied in + are guarded/deferred in CI.
- **`docx` on Workers:** pack with `Packer.toBase64String(doc)` then `Uint8Array.from(atob(b64),
  c => c.charCodeAt(0))` — the Node `toBuffer`/`toBlob` paths aren't guaranteed on the Workers
  runtime. Keep `Document` construction in a pure lib; do the packing in the route.
- **ESLint `rules-of-hooks`:** a plain (non-hook) function must NOT be named `use*` — the linter
  treats any `useX` called from a callback as a misused Hook. Name helpers `applyX`/`doX`.

## Slice entries (newest first)

### Slice 5 — Roles Workspace (Phase A) · 2026-07-03 · branch `slice/5-roles-workspace`
- **Built:** the worked shortlist — turns the static match list into a sort/filter/curate surface
  over the already-reasoned matches (no onboarding re-run, no per-action model call).
  - `lib/workspace.ts` (+ 9 tests): pure sort (fit / recency / verdict), filter (verdict / company /
    location / remote, AND-combined, dismissed always hidden), `toVerdict`, `locationText` (flattens
    `roles.location` jsonb + remote detection).
  - `/api/match/curate` (zod + RLS): save / dismiss / pursue / restore → updates `matches.status` +
    writes an append-only `decision_event` (approve/skip/view). No model call.
  - `/roles` page + `components/RolesWorkspace.tsx`: card board with fit + verdict + inline
    "why this fits" (stored rationale + gaps), optimistic **local re-rank** on curate, and a separate
    explicit **↻ refresh matches** (`/api/rematch`). "Pursue" bridges to the résumé via the existing
    `TailorButton`. Responsive single column; honest empty states (no-matches vs no-filter-match).
    `/roles` gated in middleware; feed gains a Roles link.
- **Audit D1–D10:**
  - **D1** green — tsc/lint/depcruise clean.
  - **D2/D3** green — 102/102 vitest (+9 workspace: verdict normalize, location flatten, AND filters,
    dismissed-hidden, empty result, all sorts, curate one-pass). Honest empty states covered.
  - **D4** green — `next build` (`/roles`, `/api/match/curate`; distinct from public `/explore/roles`)
    + `opennextjs-cloudflare build`.
  - **D5/D7** green — E2E/axe 9/9 (public). Workspace a11y: labelled sort/filter controls, `aria-
    expanded` on why-toggle, ≥40px targets, single-column mobile.
  - **D6** green — live-probed: `/roles` → 307, `/api/match/curate` unauth → 401; zod; RLS-scoped
    curate (owner-only, one match per user+role); no-send + no-client-secret green.
  - **D8** green — no new table (reuses `matches` + `decision_events`); status transitions only.
    **D9** green — reads the already-reasoned matches (no re-reason on curate); bounded; the one
    heavy path (`/api/rematch`) is user-triggered + already metered.
  - **D10** green — human-gated-outward intact (workspace ends at "pursue" handoff; no send); truth
    gate untouched.
- **Scenarios run:** public smoke ×3; unauth gating on `/roles` + `/api/match/curate`; unit personas
  for sort/filter/curate + empty-filter. Prompt-injection: curate stores only validated uuid+enum, no
  model call; the "why" is the user's own stored rationale.
- **Deferred (no silent gaps):** (1) **P0-7 fit-on-browse** (fit badge across `/explore`) → Phase B
  (PRD splits it; Phase A shippable alone). (2) P1 — compare 2–3 roles, per-role notes, bulk dismiss,
  saved-search→/watch. (3) keyboard triage (j/k/s/x). (4) comp sort — `roles.comp` sparse, P1 where
  present (PRD open question). (5) authed E2E of curate→re-rank — needs seeded session.
- **New learnings:** curation re-rank is **local + instant** (optimistic status update → `curate()`
  re-filters) — a full `/api/rematch` (model calls) is a *separate, explicit* refresh, never per
  keystroke/click. Keep the sort/filter logic pure so it's identical on server and client.
- **PR:** <pending>

### Slice 4 — Apply / Send (human-gated) · 2026-07-03 · branch `slice/4-apply-send`
- **Built:** the outward step — replaces the `/api/dispatch` 501 stub with the real, human-gated
  apply path. **RO composes; you send.**
  - `lib/apply.ts` (+ tests): pure — from an APPROVED résumé + role builds a subject, a short honest
    cover note (templated from the real résumé, no invention), and pre-filled **Gmail/mailto compose
    URLs + the company ATS link**. No transport, no fetch, no side effects.
  - `/api/apply` (zod + RLS): the send GESTURE. Verifies the artifact is **approved** (truth gate —
    nothing unapproved goes out), writes an append-only `decision_event` **action='send'**, and
    advances/creates the tracker row → **'applied'** (stamps `sent_at` → the pace engine sees a real
    send). **Performs NO external transport** — the actual submit happens when the user opens the
    pre-filled compose/ATS window.
  - `/apply/[id]` page + `components/ApplyPanel.tsx`: 3 steps (open your application → your composed
    note → "I've applied → track it"); honest copy "RO never sends — you do." Wired the résumé
    `ArtifactActions` "Apply — you send ↗" button to it; `/apply` added to middleware PRIVATE.
- **Audit D1–D10:**
  - **D1** green — tsc/lint/depcruise clean.
  - **D2/D3** green — 93/93 vitest (+4 apply: compose-URL encoding, note from résumé, 3-bullet cap,
    graceful missing-role). Unapproved artifact → 409 (can't apply); missing role → 409.
  - **D4** green — `next build` (`/apply/[id]`, `/api/apply`) + `opennextjs-cloudflare build`.
  - **D5/D7** green — E2E/axe 9/9 (public). Apply panel a11y: labelled steps, ≥44px primary actions,
    external links `rel=noopener`.
  - **D6** green — live-probed: `/apply/[id]` → 307, `/api/apply` unauth → 401 (auth before zod); zod
    on the route; RLS-scoped reads/writes; no-client-secret green.
  - **D8** green — no new table; reuses `applications` (append-only history) + `decision_events`
    (`send`). **D9** green — bounded single-row reads; pure bundle build; no model call.
  - **D10** green — **HUMAN-GATED OUTWARD PRESERVED + STRENGTHENED**: `no-send-tool` +
    `no-client-secret` invariants green; `lib/apply.ts` and `/api/apply` perform **zero transport**
    (only compose URLs the user opens); the agent layer still imports no send tool (depcruise clean).
    Only an approved artifact can be applied (truth gate). The `send` decision_event is written from a
    genuine UI gesture — exactly the dispatch contract, minus RO ever transporting.
- **Scenarios run:** public smoke ×3; unauth gating on `/apply` + `/api/apply`; unapproved-résumé
  block (409); unit personas for bundle composition (full/missing fields). Prompt-injection: the note
  is templated from the user's own approved résumé text; `/api/apply` makes no model call and sends
  nothing, so injected CV text can't exfiltrate or trigger an outbound action.
- **Deferred (no silent gaps):** (1) a *drafted* cover letter (currently a clean template) — the
  cover artifact is its own spec/non-goal of the résumé editor. (2) recruiter-email autofill when a
  contact is known (Gmail `to` is left blank for the user). (3) authed E2E of approve→apply→tracker
  advance — needs a seeded session. (4) `/api/dispatch` 501 stub left in place (superseded by
  `/api/apply`); safe to remove in a later cleanup.
- **New learnings:** the "send" path is a **compose-URL handoff, not a transport** — RoleOS builds
  the pre-filled Gmail/ATS URL and records the gesture; the user submits in their own tool. This keeps
  the no-send invariant literally true (no fetch/SMTP anywhere) while still "closing the loop." Any
  future outward feature should follow this shape.
- **PR:** https://github.com/nikjain15/roleos-app/pull/7

### Slice 3 — Application Tracker · 2026-07-03 · branch `slice/3-application-tracker`
- **Built:** the funnel of record — closes the goal→apply→track→adapt loop and feeds REAL
  conversions back into the pace engine.
  - `db/migrations/0011_applications.sql`: `applications` table (stage enum, **append-only
    `stage_history`**, artifact links, next_action, sent_at), **owner RLS** (sel/ins/upd/del),
    **unique (user, role)**.
  - `lib/plan/observed.ts` (+ tests): pure — derives per-stage `{conversions, trials}` from each
    application's furthest funnel stage reached (a later rejection doesn't erase progress). Wired
    into `lib/goal.ts` (`ratesFromTracker`) so `computeRates` now **blends priors with the user's
    lived funnel** (dimension 14); `appsThisWeek` feeds the agenda's real pacing.
  - `/api/applications` (zod + RLS): POST create (unique-per-role → 409), PATCH advance (appends
    history, stamps `sent_at` on first `applied`, writes a `decision_event`; terminal → `reject`).
  - `/tracker` board + `components/TrackerBoard.tsx`: stage-grouped lanes (responsive, no
    horizontal Kanban), accessible stage `<select>` to advance, one-tap "track" for pursued roles
    not yet in the pipeline. Feed gains a Tracker link; agenda now uses real sent-this-week.
- **Audit D1–D10:**
  - **D1** green — tsc/lint/depcruise clean.
  - **D2/D3** green — 89/89 vitest (+4 observed: furthest-stage-after-rejection, empty→priors,
    per-stage conversions, feeds computeRates). Graceful: **missing `applications` table → priors +
    0 apps/wk** (feed/goal still render).
  - **D4** green — `next build` (`/tracker`, `/api/applications`) + `opennextjs-cloudflare build`.
  - **D5/D7** green — E2E/axe 9/9 (public). Tracker a11y by construction: labelled selects, ≥40px
    targets, lanes stack on mobile.
  - **D6** green — live-probed: `/tracker` → 307, `/api/applications` POST+PATCH unauth → 401; zod on
    the route; **new `applications` table has owner RLS**; no-send + no-client-secret green.
  - **D8** green — additive migration; owner RLS + unique(user,role) reviewed; `stage_history`
    append-only (never rewritten — only pushed to); `decision_events` reused.
  - **D9** green — pure funnel math; bounded reads; `appsThisWeek` via `count head:true`.
  - **D10** green — **human-gated-outward intact**: reaching `applied` RECORDS that the user applied;
    RO sends nothing here (the actual send is the separate Apply path, Slice 4). Truth gate untouched.
- **Scenarios run:** public smoke ×3; unauth gating on `/tracker` + `/api/applications` (POST/PATCH);
  unit personas — furthest-stage after rejection, no-apply-yet (priors), full funnel, 50-app blend.
  Prompt-injection: `/api/applications` stores only validated enums/uuids, no model call, no send tool.
- **Deferred (no silent gaps):** (1) **apply migration 0011 to Supabase on merge** (required; code
  degrades gracefully until then). (2) authed E2E of create→advance→pace-shift — needs seeded session.
  (3) richer next_action automation + timeline view + per-stage SLAs — later. (4) tracker↔résumé
  artifact linking surfaced in UI (schema supports `artifact_ids`) — later slice.
- **New learnings:** derive funnel rates from the **furthest stage each application reached** (via
  append-only `stage_history`), not its current stage — so a rejection after an onsite still counts the
  onsite as a real trial. Keep the derivation pure (`lib/plan/observed.ts`) and unit-test it.
- **PR:** https://github.com/nikjain15/roleos-app/pull/6

### Slice 2 — Goal Setter + Plan/Pace engine + Feed cockpit · 2026-07-03 · branch `slice/2-goal-pace-feed`
- **Built:** the spine — "get X in Y days" becomes a live, honest plan.
  - `lib/plan/` (pure, heavily tested): `rates.ts` (empirical-Bayes blend of senior-PM **priors** →
    the user's real rates, each stage a rate + credible band), `plan.ts` (backward funnel as
    **ranges**, lead-time-aware **apply-by** date, weekly pace, derived Ramp/Push/Convert/Close
    phases, **feasibility verdict** on_track/at_risk/off_track + the single best lever), `agenda.ts`
    (ranked "Today" moves from plan + shortlist/draft state). 14 unit tests.
  - `db/migrations/0010_goals.sql`: first-class `goals` table (target/deadline/constraints/intensity/
    also_open_to/plan/status), **owner RLS** (sel/ins/upd/del mirroring §3.3), **partial-unique one
    active goal per user**.
  - `lib/goal.ts` (DB seam) + `POST /api/goal` (zod + RLS; upserts the active goal, recomputes &
    caches the plan, writes an `edit` decision_event).
  - `/goal` Goal Setter page + `components/GoalSetter.tsx` (target, hard/soft deadline, constraints,
    intensity, also-open-to) with a live `PlanSummary`. Feed cockpit: `components/GoalCockpit.tsx`
    added **above** the existing feed (status pill + Today agenda; graceful "set your goal" CTA when
    none) — matches/digest untouched. `/goal` added to middleware PRIVATE.
- **Audit D1–D10:**
  - **D1** green — tsc/lint/depcruise clean.
  - **D2/D3** green — 85/85 vitest (+14 pace-engine: funnel ranges, apply-by front-load, off-track on
    sub-cycle deadline, ceiling & supply feasibility, no-deadline honesty, agenda ranking + never-
    dead-ends). Graceful degradation verified: no goal → CTA; **missing `goals` table → nulls, feed
    still renders** (defensive, pre-migration safe).
  - **D4** green — `next build` (`/goal`, `/feed`, `/api/goal` compiled) + `opennextjs-cloudflare
    build` Workers bundle.
  - **D5/D7** green — E2E/axe 9/9 across 375/768/1280 (public). Goal Setter/cockpit a11y by
    construction: labelled fields, `role=status` pace pill, keyboard-usable, ≥40px targets.
  - **D6** green — live-probed: `/goal` → 307, `/api/goal` unauth → 401; zod on the route; **new
    `goals` table has owner RLS** (default-deny, one-active partial unique); no-send + no-client-secret
    invariants green.
  - **D8** green — additive migration; owner RLS + partial-unique reviewed; `decision_events` reused
    append-only (`edit`, kind `goal`); `plan` cached on the row (nightly recompute + on-change per
    §7b, computed-on-read fallback).
  - **D9** green — pure O(1) plan math (no model call in the pace path); bounded reads (single active
    goal; `count head:true` for supply/ready); no N+1.
  - **D10** green — human-gated-outward intact (setting a goal sends nothing; plan changes are
    proposed in-UI, never auto-applied; pace-nudge *delivery* is Slice 9); truth gate untouched.
- **Scenarios run:** public smoke (render/responsive/a11y ×3); unauth gating on `/goal` + `/api/goal`;
  unit personas — aggressive short deadline (off-track + extend lever), low intensity ceiling (at-risk),
  thin role supply (broaden lever), roomy goal (on-track), no-deadline (no false pace), on-pace-nothing-
  pending (agenda never empty). Prompt-injection: `/api/goal` stores only validated scalar fields, runs
  no model call, imports no send tool.
- **Deferred (no silent gaps):** (1) **apply migration 0010 to live Supabase — required deploy step**
  before/with merge (code degrades gracefully until then). (2) **Personal-rate blending** (rates from
  real `applications`) activates when the **tracker (Slice 3)** lands — currently priors-only, noted in
  `lib/goal.ts`. (3) **Priors citation** — v1 uses the spec's own senior-PM funnel (§3) as priors with
  wide bands; owner to confirm/replace the public benchmark (spec open question). (4) Authed E2E of
  goal→plan→cockpit — needs a seeded session; harness ready. (5) "also open to" widening sourcing +
  goal switching UI — captured/stored, deeper wiring is later slices.
- **New learnings:** keep the pace math **pure with `today`/`liveSupply` passed in** — deterministic,
  unit-testable, and dodges the Workflow `new Date()` ban if ever reused there. New user tables: add the
  4 owner policies + a `where status='active'` partial-unique for singleton rows.
- **PR:** https://github.com/nikjain15/roleos-app/pull/4

### Slice 1 — Résumé Editor + export · 2026-07-03 · branch `slice/1-resume-editor`
- **Built:** the truth gate turned from a wall into a resolvable craft surface.
  - `components/ResumeEditor.tsx`: two-pane canvas (left = user's real CV / source of truth,
    read-only; right = editable tailored draft). Inline **flag chips** on flagged bullets with the
    reason; three in-place **resolve actions** — *Use RO's grounded version*, *Edit myself*, *Keep
    my original*. **Autosave** (debounced), **live grounded/needs-your-eyes** status pill, and
    **Export DOCX/PDF** that enable only when grounded. Mobile: pane toggle; desktop: side-by-side.
  - `lib/resume/flags.ts` (+ test): pure violation→bullet mapper (token overlap), unmatched →
    document-level flags; excludes user-resolved violations from live status. Invariant-safe — does
    NOT touch the drafter's model contract or the truth gate.
  - APIs (all zod-validated via Slice T's `lib/validate.ts`, RLS-scoped): `PATCH …/edit` (autosave,
    content-only, snapshots the pristine draft for revert), `POST …/reground` (re-grounds ONE bullet
    strictly to `master_profile` via the **metered** registry → `agent_runs`; writes an append-only
    `correct` decision_event), `GET …/export?format=docx` (`docx` lib, selectable text, Workers-safe
    `Packer.toBase64String`+`atob`).
  - `lib/resume/docx.ts` (+ test): ATS-safe single-column DOCX builder (pure; packing in the route).
  - `…/resume/[id]/print` + `AutoPrint`: client print-to-PDF view (no headless Chrome on Workers).
  - Rewrote `…/studio/resume/[id]` to mount the editor (kept the never-blank guard + Regenerate).
- **Audit D1–D10:**
  - **D1** green — `tsc` 0 errors; `next lint` 0 errors (2 pre-existing warnings only; lint caught a
    real `rules-of-hooks` bug — a helper named `useGrounded` read as a Hook → renamed `applyGrounded`);
    `depcruise` 0 violations.
  - **D2/D3** green — 71/71 vitest incl. new `resume-flags` (5) + `resume-docx` (3, packs a real
    >500-byte DOCX); never-blank guard preserved; malformed-input → 400 (validate unit tests).
  - **D4** green — `next build` compiled the new routes (`/studio/resume/[id]` editor 4.1 kB, `/print`);
    `opennextjs-cloudflare build` produced the Workers bundle with `docx`+`atob` intact.
  - **D5/D7** green — E2E/axe harness 9/9 across 375/768/1280 (public surface). Editor a11y by
    construction: labelled fields, `role=status aria-live` truth pill, visible focus, ≥40px targets.
  - **D6** green — live-probed unauth: page → 307 login redirect, `/edit`,`/reground`,`/export` → 401;
    auth checked before any work (export reordered auth-before-format); zod on every new route; RLS
    owner policies gate cross-user reads (a foreign id → 404, filtered by RLS); reground grounds only
    to the user's own `master_profile`; no-send + no-client-secret invariants green.
  - **D8** green — no migrations; `content` jsonb extended backward-compatibly (`original`,
    `resolved_violations`); `decision_events` reused append-only (`correct`).
  - **D9** green — bounded single-row reads by id; bullets capped (zod max 60); autosave debounced +
    content-only (no per-keystroke events); the one reground model call metered to `agent_runs`.
  - **D10** green — truth gate untouched and still authoritative; grounding ≠ approval (autosave/
    reground deliberately do NOT mutate `status`; "make it mine" stays the only approval path).
- **Scenarios run:** public smoke (render/responsive/a11y ×3 viewports); unauth auth-gating probes on
  all new routes; unit personas for flag mapping (overstated scope, doc-level, resolved, multi-bullet)
  and DOCX (full/empty). Prompt-injection: reground's system prompt is truth-gate-constrained ("never
  invent", ground only to master_profile) and imports no send tool — injection in a CV can't exfiltrate
  or send.
- **Deferred (no silent gaps):** (1) **authed persona E2E** of the editor happy-path (open → resolve
  flag → autosave → export download) — needs a seeded user+artifact+session+secrets; harness is ready,
  lands when CI secrets are wired. (2) **live 2-session cross-user RLS test** — relies on existing
  `artifacts` owner policies (asserted by policy, not a live probe this slice). (3) Per-bullet flag-id
  in the drafter output (exact vs. inferred mapping) — future eng-debt, noted in `lib/resume/flags.ts`.
  (4) P1s (keyword-lift panel, undo/redo, version pins) — out of P0 scope.
- **New learnings:** `docx` packs on Workers via `Packer.toBase64String` + `atob(...)`→`Uint8Array`
  (avoid Node `Buffer`/`Blob`). A non-hook helper must not be named `use*` — ESLint `rules-of-hooks`
  treats it as a Hook. (Both added to Standing learnings.)
- **PR:** https://github.com/nikjain15/roleos-app/pull/3

### Slice T — Audit tooling + app-shell scaffold · 2026-07-02 · branch `slice/T-audit-tooling`
- **Built:** the audit harness every later slice depends on —
  - `playwright.config.ts` + `tests/e2e/` (smoke spec + `helpers/axe.ts`): Playwright E2E across
    the three D5 breakpoints (375 / 768 / 1280), self-booting `next dev`, with an
    `@axe-core/playwright` gate asserting **0 serious/critical** WCAG 2.1 A/AA violations (D7).
  - `lib/validate.ts` (+ `tests/unit/validate.test.ts`): fail-closed `zod` request-body helper so
    D6 "every new route validates input" is one call — malformed JSON / bad shape → 400, never 500.
  - `components/AppShell.tsx`: presentational app-shell scaffold (skip link, semantic `nav`/`main`,
    `aria-current`, ≥40px targets, design-token colors). Unmounted by design — slices 2–7 adopt it,
    slice 10 wires the `(app)` layout.
  - `docx` dep added (for slice 1 DOCX export); `@playwright/test` + `@axe-core/playwright` devDeps;
    `test:e2e` script; CI `e2e` job (separate runner, never concurrent with the tsc/vitest `check`
    job); `.gitignore` for Playwright artifacts.
- **Audit D1–D10:**
  - **D1** green — `tsc --noEmit` 0 errors; `next lint` 0 errors (2 pre-existing warnings in
    untouched `admin`/`dispatch` files, not introduced here); `depcruise` 0 violations (35 modules).
  - **D2/D3** green — 63/63 vitest incl. new `validate` (4); E2E smoke: public `/` renders (status
    < 500, body visible), harness fails loudly on empty suite rather than silently passing.
  - **D4** green — `next build` compiled all routes with the slice's additions, then
    `opennextjs-cloudflare build` produced the Workers bundle (`.open-next/worker.js`) with no
    node-only-API breakage. (Ran with `.dev.vars` moved aside to dodge the deploy-token trap, then
    restored — the build needs no runtime secrets.) `validate.ts` is edge-safe (`NextResponse`+`zod`);
    `AppShell` is RSC-safe; `docx` not yet imported; Playwright/axe are devDeps, never bundled.
  - **D5** green — no horizontal overflow at 375/768/1280 on `/`.
  - **D6** green — `no-send-tool` + `no-client-secret-imports` invariants pass; `validate.ts` fails
    closed; `.env.local`/`.dev.vars` copied locally for the audit are gitignored (not committed).
  - **D7** green **after fix** — axe caught a real serious contrast violation (WCAG 1.4.3) on the
    marketing landing caption (`text-tx3` #8d8c85 on `--bg` #fbfaf7 ≈ 2.9:1). Fixed to `text-tx2`
    (≈7:1); design-token system left untouched. Now 0 serious/critical across all 3 viewports.
  - **D8/D9** green by absence — no migrations, no new tables, no queries, no model calls.
  - **D10** green — all invariant tests pass; no guardrail touched.
- **Scenarios run:** public-landing render + responsive (375/768/1280) + axe a11y; unit personas via
  existing suite. Persona/edge/RLS/injection E2E specs are now *possible* on this harness and land
  with the feature slices that own those surfaces (Slice T ships no user-data route to probe).
- **Deferred (no silent gaps):** (1) live-render/a11y of `AppShell` → the slice that mounts it;
  (2) CI E2E persona flows needing Supabase/Anthropic secrets → when those secrets are added to CI
  (job is wired, secrets optional). [D4 Workers boot smoke — previously deferred — now run & green.]
- **New learnings:** **the repo must live OUTSIDE iCloud-synced `~/Documents`** — a fresh
  `node_modules` triggers a `fileproviderd` sync storm (load avg → 40+) that hangs `npm`/`tsc`/
  `vitest`/`git`. This checkout was moved to `~/dev/roleos`; the branch was rebuilt via a clean
  clone there. Also: npm's own install hangs under global-cache lock contention — use an isolated
  `--cache <scratch> --no-audit --no-fund`. (Both added to Standing learnings.)
- **PR:** https://github.com/nikjain15/roleos-app/pull/2 (base `revamp/journey`)

### Slice 0 — Résumé never-blank · 2026-07-02 · branch `revamp/journey` (c4a1982)
- **Built:** shape-repair pass in `agent/skills/run.ts` (reformat malformed structured
  output before the gate); `components/RegenerateResume.tsx` + `hasBody` guard so the résumé
  page never renders a void.
- **Audit:** D1 typecheck green. D2/D3 pending full E2E (tooling not yet installed — Slice T).
- **Deferred:** E2E/responsive/a11y automated checks until Slice T adds Playwright + axe.
- **Learning:** the empty-résumé bug (see Standing learnings) — root cause was a discarded
  unparseable draft; captured as a permanent guard for all structured skills.

---

### Entry template (prepend a copy per slice)
```
### Slice N — <name> · <date> · branch slice/<n>-<name> (<sha>)
- Built: <what shipped>
- Audit D1–D10: <per-dimension result — green / finding + fix>
- Scenarios run: <personas + edge/negative + RLS probe + injection + mobile + a11y>
- Deferred: <anything, with why> (no silent gaps)
- New learnings: <what the next slice should inherit → also add to Standing learnings if durable>
- PR: <link>
```
