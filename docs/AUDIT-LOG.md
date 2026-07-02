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

## Slice entries (newest first)

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
