# Stack & Architecture — gap analysis for the goal-driven build

> Reviewed 2026-07-02 against the live repo. **Verdict: the stack is sound — no new
> infrastructure needed.** The plan fits Next 15 + Cloudflare Workers (OpenNext) +
> Supabase. Below is exactly what to add/change, and what explicitly stays.

## What's already right (keep)

- **Runtime:** Next 15.5.18 (App Router, React 19) on Cloudflare Workers via
  `@opennextjs/cloudflare` 1.10; `nodejs_compat`; AI + ASSETS bindings; custom domain
  `ro.roleos.fyi`. No D1/KV/R2/DO/Queue in the main app — and none needed.
- **Data:** Supabase Postgres + **pgvector** + RLS + Auth. goals/applications/taste are
  just new tables + RLS — no new datastore.
- **Agents:** Anthropic SDK 0.68 via the metered registry; Workers AI `bge` embeddings;
  Cloudflare Workflows (ingestion) + `roleos-cron`. The pace engine + RO-dock reuse these.
- **CI:** `ci.yml` runs typecheck + lint + depcruise + vitest on **push to main and on every
  PR**; `deploy.yml` deploys **only on push to main**. → the PR-gated loop works out of the box.
- **Validation dep present:** `zod` is installed (see gap below).

## Changes needed (all additive)

| # | Change | Why | Risk |
|---|---|---|---|
| G1 | **Add `docx`** dependency | DOCX résumé export | low |
| G2 | **PDF export path** — client-side (browser print / `jspdf`), NOT server headless-chrome | Workers has no headless Chrome; keep it off the Workers runtime | decide at slice 1 |
| G3 | **Add Playwright + `@axe-core/playwright`** (devDeps) | the plan requires responsive + a11y + real E2E scenarios — none exist today (only 15 vitest units) | med (CI browser install) |
| G4 | **Use `zod` for API input validation** — currently **0 API routes validate input** | security hardening on every new route (`/api/goal`, `/api/applications`, `/api/apply`, `/api/ro/ask`) | low, high value |
| G5 | **CI: add jobs** — `npm audit` (deps/security), Playwright E2E+a11y, and an OpenNext **build-boot smoke** (proves it runs on the Workers runtime, not just tsc) | multi-dimension audit in CI | low |
| G6 | **Migrations 0010+** — `goals`, `applications`, `taste_dimensions` with RLS (user-own; append-only stage_history) | the goal engine + tracker | low (pattern exists) |
| G7 | **Extend `roleos-cron`** — nightly plan recompute + goal-anchored pace nudges | pace engine + proactive push | low |
| G8 | **Rate-limit new public/AI routes** (`/api/ro/ask`) like the existing index ask-rate (migration 0009) | abuse/cost guard | low |

## Explicitly NOT changing

- No new framework, database, queue, or runtime.
- No headless-browser PDF on Workers (that's why PDF goes client-side or to a later
  Browser-Rendering decision).
- The **human-gated-outward** invariant is untouched — `/api/ro/ask` and the pace engine
  import **no send tool**; sending stays the separate user-clicked `/api/apply`.

## Tooling slice (do first, before feature slices)

**Slice T — audit tooling:** add `docx`, Playwright + axe; scaffold `e2e/` with the
responsive + a11y harness; add the CI jobs (G5); add a `zod` validation helper. This makes
every later slice testable across all dimensions from day one. See `docs/AUDIT-DIMENSIONS.md`.
