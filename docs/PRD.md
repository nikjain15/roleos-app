# RoleOS, Product Requirements (PRD)

> RO runs your job hunt. You make the calls.
> Status: live at [ro.roleos.fyi](https://ro.roleos.fyi) · early-access / waitlist · no external active users yet. This PRD describes the product as built and where it goes next. Anything not yet in code is marked **Roadmap**.

---

## 1. Problem

A senior job hunt is the highest-stakes, lowest-leverage thing a professional does, and AI has broken it from both ends:

- **The roles are being reinvented.** AI PM, forward-deployed, applied-AI leadership barely existed a year ago. Decades of experience no longer map cleanly onto the titles, so keyword job boards mis-sort exactly the people best suited for the new work.
- **The funnel is flooded.** AI-written mass applications have collapsed the signal on the way in. Volume tooling makes the noise worse for everyone.

The result: the people best suited for these new senior roles are the hardest to match and the easiest to lose in the noise. Existing tools do matching *or* résumés; none run the whole arc from goal to offer, and most inflate rather than tell the truth.

## 2. Product thesis

One agent, **RO**, works *with* the candidate across the whole journey: set a goal, and RO runs **Find → Apply → Land**. RO does the work; the human keeps every decision. Two non-negotiables define the product:

1. **Human-gated outward.** RO drafts everything and sends nothing. This is not a policy, it is structural: no send tool exists in the agent, enforced by an invariant test suite and a dependency-cruiser rule (see `ARCHITECTURE.md` §6).
2. **Truth over flattery.** Scores are calibrated to real evidence; drafted claims must trace to the candidate's real profile or they are flagged. A confident wrong number is worse than an honest gap.

## 3. Personas

| Persona | Situation | Primary job-to-be-done |
|---|---|---|
| **Senior AI PM / applied-AI leader** (primary) | Deep experience, but titles are being reinvented; wants high-signal roles, not volume | "Show me the roles that actually fit my trajectory, honestly scored, and help me apply without lying." |
| **Career-switcher into PM** | Strong adjacent experience, weak keyword overlap | "Find where my real skills transfer and tell me the bridgeable gaps." |
| **Over-qualified / senior-in-transition** | Risk of being filtered out by ATS keyword matching | "Surface roles that value depth and coach me through screens and negotiation." |
| **Visa / sponsorship-needing candidate** | Extra constraint that most boards ignore | "Factor my real constraints into fit, don't waste my time." |

These personas are encoded as the E2E test scenario library in `docs/AUDIT-DIMENSIONS.md` (senior AI PM, career-switcher, visa-needing, thin one-line profile, 6-page CV, employment-gap, over-qualified, junior/contractor, non-English CV).

## 4. Jobs-to-be-done (the five gates)

RO is a five-gate agent under a simple surface. Each gate is a set of declarative skills routed to the right model at the right cost.

| Gate | JTBD | Where it lives in code |
|---|---|---|
| **1 · Match** | "Find roles that fit my trajectory, scored pursue / maybe / skip with the why and the gaps." | `lib/match.ts`, `lib/run-match.ts`, `agent/skills/{match,match_rank,search_facets}.ts`, `app/api/match` |
| **2 · Screen** | "Triage recruiter inbound, draft truth-gated screening answers and replies I send." | `agent/skills/gate2/{classify_recruiter,screening_answer,recruiter_reply}.ts`, `app/api/{recruiter,reply-desk}` |
| **3 · Build** | "Co-create a résumé, a PRD / case study, or a runnable prototype that is authentically mine." | `agent/skills/build/*`, `lib/build.ts` (authenticity gate), `app/api/build`, `sandbox/` |
| **4 · Coach** | "Run mock interviews and give me an honest debrief." | `agent/skills/{coach_prep,mock_interview,debrief}.ts`, `app/api/coach` |
| **5 · Negotiate** | "Benchmark the offer, name my leverage, draft the counter I send." | `agent/skills/negotiate.ts`, `app/api/negotiate` |

## 5. What is live vs. roadmap (verified against code)

**Live / implemented in code:**
- Metered multi-model registry (`agent/registry.json` + `agent/registry.ts`): Opus 4.8 for reasoning/critic, Sonnet 4.6 for drafting/code, Haiku 4.5 for tagging, Cloudflare Workers AI `bge-base-en-v1.5` for embeddings. Every call is metered and written to `agent_runs`.
- Grounded matching: multi-query pgvector recall (`match_roles` RPC, `db/migrations/0003_auth_and_match.sql`) over a seeded role corpus, then LLM rerank + reasoning.
- Quality gate on every skill output: shape → deterministic guardrails → LLM-judge critic → truth gate → bounded revise loop (`agent/quality-gate.ts`). Confidence is computed deterministically from the gate signals (`computeConfidence`), and the truth gate fails closed. The deterministic PII/privacy scan in the guardrails is still an honest stub; the LLM truth gate is real.
- Primary answer path routed through an embedded `@conduit/client` seam (`agent/conduit.ts`, `lib/conduit/`): same metered `callModel` core, a stable interface that can later point at a hosted gateway with no call-site changes. Env-gated live-usage reporting mirrors each metered decision to a Conduit gateway when `CONDUIT_GATEWAY_URL`/`CONDUIT_GATEWAY_TOKEN` are set (`lib/conduit/reporter.ts`), a fire-and-forget no-op otherwise.
- Dynamic difficulty routing (`agent/routing.ts`): a deterministic classifier seeds a starting tier on the Haiku→Sonnet→Opus ladder; trivial inputs route down, and a failing gate or weak computed confidence escalates up, bounded and metered. The `RoutingTrace` is persisted into `agent_runs.trace` on background/batch paths (not yet surfaced on the interactive routes).
- Read-only MCP server exposing `search_roles` over the public role corpus (typed JSON-Schema args, validation, structured errors) over stdio (`lib/mcp/`, `npm run mcp:stdio`; `docs/MCP.md`).
- Human-gated-outward invariant: no send tool in `agent/tools/index.ts`; enforced by `tests/invariants/no-send-tool.test.ts` and `.dependency-cruiser.cjs`. The single outbound route `app/api/dispatch` returns 501 (contract scaffolded, no live transport yet).
- Row-level-security coverage invariant across all user-owned tables (`tests/invariants/rls-coverage.test.ts`).
- Wellbeing invariant: engagement-bait notification kinds can never fire (`tests/invariants/wellbeing.test.ts`).

**Roadmap (scaffolded but not fully wired):**
- Live transport in `app/api/dispatch` (email / ATS send behind the human click), currently returns 501.
- The three read tools (`get_master_profile`, `get_role`, `search_roles`) are live-backed; the remaining agent tool `run` implementations are Phase-1 placeholders returning `{ todo: "phase 2" }` in `agent/tools/index.ts`; the skill surface and the invariant are what is enforced today.
- MCP HTTP/SSE transport: the two-endpoint URL shape is documented (`docs/MCP.md`) but not yet mounted in an app route; the MCP SDK is an optional dependency imported only by a live transport. Stdio works today.
- Durable overnight hunt / research-brief / weekly-review flows exist as specs under `docs/specs/` and feature branches; treat as Now/Next/Later below.

## 6. Success metrics

Because there are no external active users yet, near-term success is **build-quality and reliability**, not usage.

**Product-quality metrics (measurable today or with the eval harness in `EVALS.md`):**
- **Match quality:** shortlist precision@10 and recall of known-good roles vs. a labeled set; calibration of `pursue/maybe/skip` vs. human judgment.
- **Truth-gate catch rate:** fraction of injected/fabricated claims flagged (target: no fabricated claim ships).
- **Guardrail precision/recall:** the deterministic voice + no-send guardrail on outputs (see `/evals`).
- **Cost per journey:** USD per candidate across the five gates, tracked in `agent_runs`; daily budget alerting at 80% (`lib/cost-budget.ts`).

**North-star (post-launch, roadmap):** offers landed per activated candidate, and time-to-first-genuine-fit.

## 7. Tradeoffs (explicit)

- **Quality over latency.** The registry deliberately uses the reasoning tier for the critic and truth gate, so judging costs as much as drafting. This is a stated non-negotiable in the README, not an oversight.
- **Structural safety over flexibility.** Making "send" impossible in the agent layer means the agent literally cannot auto-apply, even where a user might want it. We chose trust.
- **Grounded recall over recall breadth.** Matching is bounded to an embedded corpus; a role not in the corpus cannot be surfaced. Multi-query facet expansion mitigates domain bias (`lib/run-match.ts`) but the corpus is the ceiling.
- **Config-swappable models over a single provider abstraction.** The registry is Anthropic-first by design; swapping a model is a config edit, swapping providers is a code change.

## 8. Roadmap, Now / Next / Later

**Now (in code, hardening):**
- Five gates functioning through the quality gate; multi-model registry metered; pgvector matching; invariant + RLS + wellbeing guards green.

**Next (scaffolded, needs wiring):**
- Live transport behind `app/api/dispatch` (the human-clicked send) with decision-event + approved-artifact preconditions.
- Real DB-backed implementations of the six agent tools (`get_master_profile`, `search_roles`, `score_fit`, …).
- Overnight hunt, research briefs, comp copilot, weekly review (specs under `docs/specs/x*.md`).

**Later (vision):**
- Outcome-learning loop that recalibrates scoring from real results (`lib/outcome-learning.ts` scaffolding exists).
- Public browsable role index (`docs/explore-index.md`).
- Referral finder and voice mocks.

---

*Grounded in the repository at the `revamp` branch. Model IDs, gate mapping, and invariants were read directly from `agent/`, `lib/`, `db/`, and `tests/`.*
