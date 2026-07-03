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

## Slice entries (newest first)

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
  - **D4** deferred (justified) — slice adds **no Workers-runtime code** (`validate.ts` uses only
    `NextResponse`+`zod`, edge-safe; `AppShell` is RSC-safe `next/link`; `docx` not yet imported;
    Playwright/axe are devDeps, never bundled). Full `opennextjs-cloudflare build` boot smoke
    deferred to the first slice that ships a route (also avoids the `.dev.vars` deploy-token trap).
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
- **Deferred (no silent gaps):** (1) `opennextjs-cloudflare` boot smoke → first route-shipping slice;
  (2) live-render/a11y of `AppShell` → the slice that mounts it; (3) CI E2E persona flows needing
  Supabase/Anthropic secrets → when those secrets are added to CI (job is wired, secrets optional).
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
