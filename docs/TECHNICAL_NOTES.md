# RoleOS, Technical Notes & Scorecard

> A candid technical teardown scored against a 12-point Technical-AI-PM / FDE rubric.
> Each score is 0–5 with file-level evidence and the honest gap. Scores describe the
> repository as read on the `revamp` branch; traction is early-access / waitlist, so
> the lens is **build + architecture quality**, not usage.

## 12-point scorecard

| # | Dimension | Score | Evidence (file refs) | Gap |
|---|---|---|---|---|
| 1 | **Model choice** (LLM vs ML vs hybrid) | 5 | Hybrid by design: `bge` embeddings (ML retrieval) + Claude tiers for reasoning/drafting/judging; each *job* names a model in `agent/registry.json`. Deliberate: reasoning tier for judgment, cheap tier for tagging. | Single provider for generation (Anthropic-only by design); provider swap is a code change, not config. |
| 2 | **How the AI works** (context / grounding) | 5 | Grounded prompts operate over the user's real data (`agent/skills/*`); confidence-ladder calibration in the `match`/`negotiate` prompts; effort + adaptive thinking instead of temperature (`agent/registry.ts`). | Truth-gate + privacy scans are per-gate deepened; some are honest stubs (`runGuardrails` notes this explicitly). |
| 3 | **Tools / MCP** (schemas, validation, errors) | 4 | Typed tool interface + fixed allowlist (`agent/tools/index.ts`); `zod` on route inputs; `parseModelJson` + shape-repair for model JSON (`agent/skills/run.ts`). | Tool `run` bodies are Phase-1 placeholders (`{ todo: "phase 2" }`); no MCP server surface. |
| 4 | **Agents & skills** | 5 | Skill = one declarative file (`agent/skills/skill.ts`); five gates as skill families (match / gate2 / build / coach / negotiate); one stateless runner. Adding an agent is a one-file change. | Orchestration across gates is per-route, not a single planner; by design (simplicity over a framework). |
| 5 | **Orchestration & routing** (multi-model, cost) | 5 | Real config-driven routing: `callModel(job)` resolves model + params and writes a metered `agent_runs` row every call (`agent/registry.ts`); daily budget alerting (`lib/cost-budget.ts`); tiered models per job. | No automatic fallback/failover between models yet (a timeout surfaces honestly rather than re-routing). |
| 6 | **RAG & context** (retrieval, failure modes) | 4 | Multi-query pgvector recall + union + rerank + reason (`lib/match.ts`, `lib/run-match.ts`); one shared vector space enforced by construction (`lib/embeddings`); facet expansion beats domain bias. | Recall ceiling = embedded corpus; no re-ranking cross-encoder; freshness loop is a plan (`docs/setup-role-refresh.md`). |
| 7 | **Evals & grounding** | 4 | Online LLM-judge (voice + truth, fail-closed) in `agent/quality-gate.ts`; live injection eval; offline retrieval harness with precision/recall/F1/MRR (`evals/retrieval/`). | Labeled eval sets are small/synthetic; calibration + truth-gate eval sets and A/B are roadmap (no users yet). |
| 8 | **Code quality** | 5 | `npm run check` = tsc + lint + dependency-cruiser + vitest; >320 unit/invariant cases + >100 live E2E; strong module boundaries; heavily commented intent. | Some Phase-1 placeholders await real bodies; branch sprawl (50+ slice branches) is process, not code debt. |
| 9 | **Scalability & cost** | 4 | Serverless on Cloudflare Workers; durable ingestion via Workflows; every model call metered; bounded queries + rate limiting (`lib/rate-limit.ts`). | No load/scale numbers (pre-traction); recall pool sizes are tuned constants, not adaptive. |
| 10 | **Guardrails & safety** | 5 | Three independent layers make sending impossible in the agent: no send tool (`tests/invariants/no-send-tool.test.ts`), separate dispatch module, CI import ban (`.dependency-cruiser.cjs`). Plus RLS-coverage invariant, wellbeing invariant, no-client-secret invariant, truth gate fails closed. | Dispatch transport not yet implemented (501), so the *end-to-end* send path is unproven in prod. |
| 11 | **Product layer** (PRD) | 5 | Personas, JTBD, metrics, tradeoffs, Now/Next/Later in `docs/PRD.md`; product decisions grounded in code; extensive design specs under `docs/specs/`. | Success metrics are quality-oriented (no usage data yet). |
| 12 | **FDE journey** | 4 | `docs/FDE_JOURNEY.md`: integration points, secrets, RLS, observability, rollout, de-risking; live prod smoke spec against `ro.roleos.fyi`. | Single-tenant SaaS today; multi-tenant / customer-env deployment patterns are described, not yet exercised. |

**Aggregate: 55 / 60.** The standout strengths are structural safety (dim 10), real metered multi-model routing (dim 5), and code/test discipline (dim 8). The honest weaknesses all trace to one fact: the product is pre-traction, so eval datasets are small, A/B is roadmap, and the outbound transport is scaffolded but not live.

## Model & orchestration details

- **Registry** (`agent/registry.json`): `reason`=`claude-opus-4-8`, `draft`/`code`=`claude-sonnet-4-6`, `quick_tag`=`claude-haiku-4-5`, `critic`=`claude-opus-4-8`, `embed`=`@cf/baai/bge-base-en-v1.5` (768-dim). Costs are encoded per job (USD /Mtok) and used to compute `cost_usd` on every call.
- **Sampling:** Opus 4.8 / Sonnet 4.6 reject `temperature`/`top_p`/`budget_tokens` (400), so depth is steered with `output_config.effort` + adaptive thinking; Haiku is a plain call. Asserted in `tests/unit/registry.test.ts`.
- **One call path:** no skill talks to the SDK directly; `callModel` is the sole Anthropic entry point and has no send capability by construction.

## Guardrails (defense in depth)

1. Structural: no send tool + separate dispatch module + CI import ban.
2. Deterministic: no-send output-marker scan + voice blocklist (`inspectGuardrails`).
3. LLM-judge: voice critic + truth gate (fail-closed).
4. Data: RLS-coverage invariant, no-client-secret invariant, wellbeing invariant.
5. Operational: rate limiting, security headers, cost-budget alerting.

## Cost posture

Quality-first budget (reasoning tier judges reasoning-tier drafts) with a hard safety net: rolling 24h `agent_runs` spend vs. a default $25/day budget, warn at 80%, structured alert lines for Workers Logs (`lib/cost-budget.ts`). Cost-per-journey is a first-class, queryable quantity.

## `[VERIFY WITH NIK]`

- **Commit count:** README/DECISIONS cite ~203 commits; the working clone shows **208** commits on `main`. Minor and self-correcting; flag only so the profile copy can be updated if desired.
