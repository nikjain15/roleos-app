# RoleOS - Forward-Deployed Engineer Journey

> How RO deploys into a real environment and earns trust: integration points, secrets
> and security, rollout / cutover, observability, and de-risking. Grounded in the repo's
> actual runbooks (`docs/setup-*.md`, `docs/security-audit.md`) and config
> (`wrangler.jsonc`, `db/migrations/`). RoleOS ships as a single-tenant SaaS today; the
> patterns below are what make a customer-environment deployment safe, and where that is
> still roadmap it is marked as such.

## 1. Integration points

RO integrates along four seams, each swappable at a single point:

| Seam | Integration | Code / runbook |
|---|---|---|
| **Identity / auth** | Supabase auth - magic-link, Google OIDC, LinkedIn OIDC | `docs/setup-google.md`, `middleware.ts` |
| **Data of record** | Supabase Postgres + pgvector; RLS-scoped per user | `db/migrations/`, `docs/security-audit.md` |
| **Model providers** | Anthropic (generation) + Cloudflare Workers AI (embeddings), both behind the registry | `agent/registry.json` |
| **Ingestion** | Durable Cloudflare Workflow + scheduled Worker that hunts and embeds the role corpus | `ingest/`, `cron/`, `docs/admin-ingestion.md` |
| **Outbound (human-gated)** | The single `app/api/dispatch` route - the only place a send can ever happen | `docs/specs/apply-send-design.md` |

Because models and embeddings are resolved through the registry, pointing RO at a customer's preferred model endpoint or a private embedding space is a config edit, not a rewrite - the exact property an FDE wants when landing in a constrained environment.

## 2. Security & secrets

- **Secrets** are Worker environment bindings, never in client code - enforced by `tests/invariants/no-client-secret-imports.test.ts`. Rotation runbook: `docs/runbooks/secret-rotation.md`. Example surface: `.dev.vars.example`.
- **Row-level security** is mandatory on every user-owned table and machine-checked by `tests/invariants/rls-coverage.test.ts` - a migration that adds a `user_id` table without RLS fails the build before it can leak.
- **Cross-user isolation** is proven live by `tests/e2e/live/rls.spec.ts` (user A cannot read user B's goals/applications/artifacts).
- **Prompt injection** through candidate-supplied documents is a tested threat, not a hope: `tests/e2e/live/injection.spec.ts` verifies an injected CV cannot make RO fabricate.
- **Egress is fixed-host.** The dependency-cruiser invariant forbids arbitrary outbound transport in the agent layer, so RO cannot be steered into exfiltrating data to an attacker-chosen endpoint.
- **Phase-5 security audit** is documented green in `docs/security-audit.md` (RLS + secrets).

## 3. The trust guarantee for a customer

The single most important FDE talking point: **RO drafts, a human sends, and this is structural, not a setting.** Three independent guards (no send tool, a separate dispatch module, a CI import ban - see `ARCHITECTURE.md` §6) mean no prompt, no jailbreak, and no future refactor can make the agent send on a user's behalf without a deliberate, reviewable change to a *different* module. For a security-conscious enterprise, "the agent literally cannot email your customers" is a far stronger claim than "the agent is instructed not to."

## 4. Rollout / cutover

- **Deploy runbook:** `docs/setup-deploy.md` - Cloudflare Workers via `@opennextjs/cloudflare`, secrets, custom domain, Supabase auth wiring. `SETUP.md` covers first build.
- **Corpus seeding:** `npm run seed:roles` then `npm run seed:embeddings` populate and embed the role corpus into the same vector space RO queries; `db/seed/` includes archive/prune/refresh scripts for keeping it fresh.
- **Runtime parity check:** `docs/AUDIT-DIMENSIONS.md` D4 requires an `opennextjs-cloudflare build` boot smoke - the app must actually run on the Workers runtime, not just typecheck.
- **Cutover safety:** the outbound transport is scaffolded (`app/api/dispatch` returns 501) precisely so the whole product can be exercised end-to-end *before* any real send is enabled. Enabling it is a gated, reviewable step with explicit preconditions (authenticated user + a genuine UI decision-event + an approved artifact).

## 5. Observability

- **Metered model calls:** every `callModel` writes an `agent_runs` row (model, tokens, `cost_usd`, stop reason). Cost and quality are queryable per skill and per journey.
- **Budget alerting:** `lib/cost-budget.ts` emits structured warn/exceeded lines (JSON) that Cloudflare Workers Logs can alert on; throttled so telemetry never adds load.
- **Health + prod smoke:** `app/api/health`, `tests/e2e/live/health.spec.ts`, and a production smoke spec (`test:e2e:prod`) that runs against `https://ro.roleos.fyi`.
- **Quality verdicts** from the gate (shape / guardrails / critic / truth / revised) are returned per generation, so a regression in draft quality is observable, not silent.

## 6. De-risking (how an FDE lands this without breaking anything)

1. **Structural invariants over policy** - the safety-critical properties (no send, RLS, no client secrets, wellbeing) are CI-enforced tests; a customer's security team can read the guards, not take a promise.
2. **Config-swappable seams** - models, embeddings, and auth each change at one point, so adapting to a customer's provider or identity constraints is low-blast-radius.
3. **Ship gate per slice** - the 10-dimension audit matrix (`docs/AUDIT-DIMENSIONS.md`) plus persona and edge-case scenario libraries (URL-only input, scanned PDF, empty profile, injection, cross-user probe, token pressure, mobile, keyboard-only) mean each surface degrades honestly instead of crashing.
4. **Honest failure states** - the quality gate surfaces `needs_your_eyes` rather than shipping a low-confidence draft; the truth gate fails closed. A confident wrong answer is treated as the worst outcome.

## 7. What is roadmap for a true customer-environment deployment

- **Live outbound transport** behind the human click (email / ATS), with the decision-event + approved-artifact preconditions in `docs/specs/apply-send-design.md`.
- **Multi-tenant** deployment patterns (per-customer isolation beyond per-user RLS).
- **Customer-managed model endpoints / VPC egress** - the registry seam makes this tractable but it is not yet exercised.
- **Corpus-freshness automation** (`docs/setup-role-refresh.md`) as a recurring, monitored loop.

---

*Grounded in `docs/setup-*.md`, `docs/security-audit.md`, `wrangler.jsonc`, `db/`, and the invariant + live E2E test suites.*
