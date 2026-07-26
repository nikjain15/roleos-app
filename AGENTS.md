# RoleOS

An AI-first agent that runs a senior job hunt: it finds roles that fit your trajectory, scores them honestly, and co-creates tailored applications with you.

## Project overview

RoleOS (the agent is "RO") helps senior candidates run their job search across five gates: matching, screening and recruiter handling, a build studio, interview coaching, and negotiation. RO drafts every outward artifact (resumes, cover notes, PRDs, prototypes, replies), but every send is human-gated: RO drafts, you send. The app is live at ro.roleos.fyi and is built for experienced individual contributors and leaders running a high-signal, low-noise hunt.

## Tech stack

- Next.js 15 (App Router) with React 19, deployed to Cloudflare Workers via `@opennextjs/cloudflare`.
- TypeScript 5.7 (strict), Tailwind CSS 3.4, PostCSS.
- Supabase (Postgres, pgvector, Row Level Security, auth) for data, vectors, and magic-link, Google, and LinkedIn OIDC sign-in.
- Anthropic API (`@anthropic-ai/sdk`): Opus for reasoning and critic, Sonnet for drafting and code, Haiku for tagging, resolved through a metered model registry.
- Cloudflare Workers AI (`bge-base-en-v1.5`, 768-dim) for embeddings; Cloudflare Workflows for durable ingestion; Cloudflare Sandbox SDK for live prototype previews.
- Zod for validation, `docx` and `unpdf` for document handling.
- Vitest for unit and invariant tests, Playwright (with axe-core) for e2e and accessibility, dependency-cruiser for architecture invariants, ESLint (next config), wrangler for Cloudflare tooling.

## Setup

Requires Node 20 or newer and `wrangler` logged in via OAuth.

```bash
npm ci                 # install dependencies
npm run dev            # Next dev server at http://localhost:3000
```

Copy `.dev.vars.example` to `.dev.vars` (gitignored) and provide the server-side secrets before running features that call Anthropic, Supabase service role, or Cloudflare Workers AI. See `SETUP.md` and `docs/setup-deploy.md` for the full environment and deploy runbook.

Data seeding (service-role env required):

```bash
npm run seed:roles         # load the initial role corpus
npm run seed:embeddings    # generate embeddings for the corpus
```

## Build

```bash
npm run build      # next build
npm run preview    # opennextjs-cloudflare build, then local Workers preview
npm run deploy     # opennextjs-cloudflare build, then deploy to Cloudflare
```

`npm run cf-typegen` regenerates Cloudflare binding types into `cloudflare-env.d.ts`.

## Testing

Run these checks sequentially, not concurrently: parallel runs can corrupt `node_modules` in this repo.

- `npm test` (`vitest run`): unit tests plus invariant guards under `tests/unit` and `tests/invariants`.
- `npm run test:watch`: vitest in watch mode.
- `npm run typecheck`: `tsc --noEmit` (allow 30 to 60 seconds).
- `npm run lint`: `next lint` (ESLint).
- `npm run invariant:imports`: dependency-cruiser guard proving the agent layer imports no outbound transport.
- `npm run test:e2e`: Playwright persona flows, responsive checks, and axe accessibility sweeps.
- `npm run test:e2e:ui`: Playwright interactive UI runner.
- `npm run test:e2e:live`: Playwright against the live harness config (`playwright.live.config.ts`).
- `npm run test:e2e:prod`: Playwright production smoke against ro.roleos.fyi.
- `npm run audit:high` (`npm audit --omit=dev --audit-level=high`): fail on high or critical production dependency advisories.
- `npm run check`: the standard local gate, runs typecheck, lint, invariant:imports, and test in sequence.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, the import invariant, the full test suite, and the high-severity audit in a `check` job, plus a separate `e2e` job so Playwright never shares `node_modules` with vitest.

## Code style and conventions

- TypeScript with `strict` mode; ESM modules (`"type": "module"`), target ES2022.
- Path alias `@/*` maps to the repo root; prefer it over long relative import chains.
- Linting via ESLint extending `next/core-web-vitals` and `next/typescript`. Generated and vendored directories (`.next`, `.open-next`, `sandbox/spike`, `seed`) are ignored.
- Validate external and model inputs with Zod schemas.
- Architecture invariant: nothing under `agent/` may import an outbound transport (email, raw HTTP send, `lib/email`) or the dispatch route. Drafting and sending are separate modules; sending is a distinct user-clicked route. This is enforced by dependency-cruiser and by `tests/invariants`.

## Project structure

- `agent/`: RO's skills, tools, the quality gate (LLM-judge), and the metered model registry (`registry.json`, `registry.ts`).
- `app/`: Next.js App Router routes. Route groups cover the authenticated product `(app)` (feed, studio, tracker, reply-desk, offers, and more), `(marketing)`, and `(public)`; `app/api/` holds the route handlers per gate; `app/admin`, `app/auth`, and `app/design` (live style guide) round it out.
- `components/`: React UI, including `components/ui` primitives and `components/explore`.
- `lib/`: services and domain logic, including `embeddings`, `plan`, `ingest`, `resume`, matching, comp, notifications, Google integration, and the `supabase` client, server, and service helpers.
- `db/`: Supabase SQL migrations and seed scripts (`db/migrations`, `db/seed`).
- `ingest/` and `cron/`: Cloudflare Workers for durable corpus ingestion and scheduled digests plus bounded ingest.
- `sandbox/`: Cloudflare Sandbox SDK worker for live prototype previews (`sandbox/studio`) and spikes.
- `seed/`: the initial role seed data organized per company.
- `tests/`: `unit`, `invariants`, `e2e` (including `live`), and `stress` suites.
- `docs/`: PRD, architecture, evals, technical notes, setup runbooks, and the design system spec.
- `evals/`: self-contained offline retrieval eval harness.
- `supabase/`: Supabase project config and migrations mirror.

## Commit and PR guidelines

- Branch off `main` for changes; open a pull request into `main`.
- Keep commits focused with clear, imperative messages.
- All checks must pass before merge: CI runs typecheck, lint, the import invariant, the full test suite, and the high-severity dependency audit, plus the Playwright e2e and accessibility job. Run `npm run check` locally first.
- Preserve the non-negotiables: human-gated outward (no send tool in the agent), truth-gated drafts, and the single design system.

## Security and secrets

- All secrets are server-side only and never reach the client bundle. This is enforced by `tests/invariants/no-client-secret-imports.test.ts`.
- `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server secrets. The Supabase URL and anon key (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are safe to expose because Row Level Security is the boundary.
- Local secrets live in `.dev.vars` (Worker and scripts) and `.env.local` (Next dev), both gitignored. Use `.dev.vars.example` as the template. Note: `CLOUDFLARE_API_TOKEN` must not go in `.env.local`, since wrangler auto-loads that file and a non-deploy token causes auth errors.
- Additional secrets cover Google OAuth (Gmail and Calendar scopes, configured in Supabase Auth), Cloudflare account id and Workers AI token, and optional scraper and sandbox providers. Production secrets are configured in Cloudflare and GitHub Actions, per `docs/setup-deploy.md`.
- The security posture (RLS coverage plus secrets audit) is tracked in `docs/security-audit.md`.
