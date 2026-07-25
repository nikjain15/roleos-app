<p align="center">
  <a href="https://ro.roleos.fyi"><img src="assets/hero.png" alt="RoleOS" width="820"></a>
</p>

<p align="center"><b>RoleOS — RO runs your job hunt. You make the calls.</b><br>
  <a href="https://ro.roleos.fyi">Live at ro.roleos.fyi ↗</a></p>

---

# RoleOS

**An AI-first agent that runs your senior job hunt.** RO finds roles that fit your
trajectory, scores them honestly (pursue / maybe / skip), and co-creates tailored
applications with you — résumés, PRDs, prototypes, screening answers, interview prep,
and negotiation. Every outward action is human-gated: RO drafts, **you send**.

Live at **[ro.roleos.fyi](https://ro.roleos.fyi)**.

## Stack

- **Next.js 15 (App Router)** on **Cloudflare Workers** via `@opennextjs/cloudflare`
- **Supabase** (Postgres + pgvector + RLS + auth) — magic-link, Google, LinkedIn OIDC
- **Anthropic API** — Opus (reason/critic), Sonnet (draft/code), Haiku (tag) via a metered agent registry
- **Cloudflare Workers AI** (`bge-base-en-v1.5`) for embeddings; **Cloudflare Workflows** for durable ingestion

## The five gates

1. **Match** — reason over the corpus, rank with calibrated why + gaps
2. **Screening / recruiter** — classify inbox, truth-gated answers, you-send replies
3. **Build studio** — co-create résumés, PRDs/case studies, and sandboxed prototypes with an enforced authenticity gate
4. **Coach** — mock interviews + honest debrief
5. **Negotiation** — benchmark, leverage, drafted counter (you send)

## Repository layout

| Dir | Role |
|---|---|
| `agent/` | RO's skills, tools, quality gate, model registry |
| `app/` | Next.js routes (onboarding, feed, studio, admin, auth) |
| `components/` | React UI |
| `lib/` | Services: embeddings, matching, ingestion, google, digest, notifications |
| `db/` | Supabase migrations (schema, RLS, auth, notifications, ingestion) |
| `ingest/` | Durable Cloudflare Workflow that hunts the role corpus |
| `cron/` | Scheduled worker (hourly digests + bounded ingest) |
| `sandbox/` | Cloudflare Sandbox SDK worker for live prototype previews |
| `seed/` | Initial 557-role seed + embeddings |
| `tests/` | Unit + invariant tests (incl. human-gated-outward guards) |
| `docs/` | Setup runbooks, security audit, architecture handoff |
| `archive/` | Parked role snapshots from the manual→automated ingestion migration |

## Getting started

- **First build / deploy:** [`SETUP.md`](SETUP.md) then [`docs/setup-deploy.md`](docs/setup-deploy.md)
- **Picking up development:** [`docs/HANDOFF.md`](docs/HANDOFF.md)
- **Design source-of-truth (visual):** [`docs/specs/design-system.md`](docs/specs/design-system.md) — the tokens, type, and components every screen is built on. Live style guide at `/design`.
- **Design source-of-truth (product/arch):** `../roleos-design/architecture.md`

### Docs index

| Doc | Purpose |
|---|---|
| `docs/HANDOFF.md` | Continuation brief + repo/stack overview |
| `docs/setup-deploy.md` | Cloudflare deploy runbook (secrets, custom domain, Supabase auth) |
| `docs/setup-google.md` | Google OAuth + Gmail/Calendar scopes |
| `docs/setup-scraper.md` | Optional LinkedIn URL→profile fetch (Apify/Bright Data) |
| `docs/setup-sandbox.md` | Live prototype previews (Docker + CF Containers) |
| `docs/setup-role-refresh.md` | Recurring corpus-freshness loop (plan) |
| `docs/admin-ingestion.md` | Admin-driven ingestion pipeline (finalized) |
| `docs/explore-index.md` | Public browsable role index (spec) |
| `docs/security-audit.md` | Phase-5 RLS + secrets audit (green) |
| `docs/specs/design-system.md` | **Visual design system** — tokens, type, components (the contract for every screen) |

## Docs

Technical-PM / FDE documentation for this repo (grounded in the actual code):

| Doc | What's inside |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Personas, jobs-to-be-done (the five gates), success metrics, tradeoffs, Now/Next/Later roadmap |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System overview + component and matching-flow Mermaid diagrams; the metered multi-model registry, pgvector matching, quality gate, and the human-gated-outward invariant |
| [`docs/EVALS.md`](docs/EVALS.md) | Eval ladder (unit → LLM-judge → offline model evals → A/B); named metrics; what's implemented vs roadmap |
| [`docs/TECHNICAL_NOTES.md`](docs/TECHNICAL_NOTES.md) | 12-point Technical-AI-PM / FDE scorecard with file-level evidence, model/orchestration details, guardrails, cost |
| [`docs/FDE_JOURNEY.md`](docs/FDE_JOURNEY.md) | Deploying into a real environment: integration, secrets/security, rollout/cutover, observability, de-risking |
| [`evals/`](evals/) | Self-contained offline eval harness (retrieval precision/recall/F1/MRR) — `npx tsx evals/retrieval/run.ts` |

## Non-negotiables

- **Human-gated outward** — no send tool exists in the agent; enforced by `tests/invariants/`.
- **Quality over latency** — never trade output quality for speed; optimize speed separately.
- **Truth-gated** — drafted claims must trace to your real profile or they're flagged for your eyes.
- **One design system** — every screen is built on [`docs/specs/design-system.md`](docs/specs/design-system.md) (grape accent · cool neutrals · Space Grotesk + Plus Jakarta Sans · two faces). No warm-paper, no Inter, no ad-hoc palettes. Each Phase-J slice rebuilds its screen fully on it.
