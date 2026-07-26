# Architecture & Build Plan, the fully-functional goal-driven product

> Status: **DRAFT for build** · Owner: Nik · Turns the 14 screens + Goal Engine into
> a concrete data model, services, and a guardrailed build order. Read with
> `goal-engine.md` and the full-product wireframes.

## Principle

Build on what's already live, **no new infrastructure**. Everything below fits the
current stack: Next 15 (App Router) on Cloudflare Workers via `@opennextjs/cloudflare`,
Supabase (Postgres + pgvector + RLS + Auth), Anthropic via the metered registry, Workers
AI `bge` embeddings, Cloudflare Workflows (ingestion) + the `roleos-cron` worker. We add
tables, routes, and pure-TS compute, not platforms.

## 1 · Data model (new migrations 0010+)

| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| **goals** | the "X in Y" goal + cached plan | `user_id, target jsonb, deadline_date, deadline_hard, constraints jsonb, intensity jsonb, also_open_to jsonb, status, plan jsonb, computed_at` | user-own; partial-unique one `active` per user |
| **applications** | the tracker = funnel source of truth | `user_id, goal_id, role_id, stage (enum), stage_history jsonb (append-only), artifact_ids jsonb, next_action jsonb, sent_at, updated_at` | user-own |
| **taste_dimensions** | the 15-dim self-learning model | `user_id, dimension (enum 1–15), inference jsonb, confidence, provenance jsonb (event ids), updated_at` | user-own (derived) |

Reuse: **`decision_events`** (append-only) stays the event stream feeding both taste +
funnel calibration; **`artifacts`** gains an editable body + export; **`roles`/ingestion**
unchanged. `applications.stage` enum: `saved · drafting · ready · applied · screening ·
interviewing · onsite · offer · rejected · withdrawn`.

## 2 · The pace engine (pure TS, `lib/plan/`)

- `rates.ts`, derive per-user conversion from `applications.stage_history`; **empirical-
  Bayes blend** with published priors (shrink by sample size). Returns each stage rate + CI.
- `plan.ts`, `computePlan(goal, applications, rates)` → funnel counts (ranges), lead-time-
  aware **apply-by** schedule, weekly targets, derived milestones/phases, feasibility verdict
  (`on_track | at_risk | off_track`) + the single best lever.
- **When it runs:** nightly recompute in `roleos-cron` + on goal change and on every stage
  change (server action). Result cached on `goals.plan` (computed on read is a fallback).
- `agenda.ts`, `computeAgenda(goal.plan, applications, artifacts)` → the ranked "Today"
  actions for the Feed cockpit. Pure; no model call.

## 3 · Services / routes (new + changed)

| Route | Does | Gate |
|---|---|---|
| `/goal` + `/api/goal` | Goal Setter; create/update/switch active goal → triggers plan compute | you |
| `/feed` (rewrite) | Cockpit: goal status + Today agenda + prioritized pipeline; RO docked |  |
| `/roles` + `/api/rematch` | Roles Workspace: sort/filter/save/dismiss/live re-rank |  |
| `/studio/resume/[id]` (rewrite) + `/api/artifact/[id]/edit` + `/export` | Résumé editor: see/edit/resolve flags/export PDF+DOCX | you |
| `/tracker` + `/api/applications` | Pipeline board; advance stage; next actions |  |
| `/apply/[id]` + `/api/apply` | Compose bundle → pre-filled ATS/Gmail; **replaces the 501 dispatch** | **you send** |
| `RoDock` + `/api/ro/ask` | Context-aware ask/act layer on every screen (answer · filter view · draft) | actions human-gated |
| Explore `AskRo` (rewrite) | Structured answers, clickable roles, follow-ups, filter-from-answer |  |
| cron extension | nightly plan recompute + **goal-anchored pace nudges** (no guilt) |  |

**Invariant preserved:** `/api/ro/ask` uses the registry's tool framework but imports **no
send tool**, the no-send dependency-cruiser rule + tests stay green. Sending stays the
separate, user-clicked `/api/apply`/dispatch path.

## 4 · Tech-stack additions (minimal)

- **DOCX export:** the `docx` library (server-side render). **PDF export:** HTML→PDF, open
  item: lightweight Workers-compatible path vs. a small render step; decide at slice 1.
- **Everything else reuses existing deps:** pace math is pure TS (no new dep), RO-dock uses
  the existing agent registry, tracker/goal are plain Postgres + RLS.
- No new runtime, no new database, no new queue.

## 5 · Build order, slices (each: branch → build → tests/typecheck/lint green → preview-verify → responsive + a11y → invariants intact → merge)

| # | Slice | Why here | New/changed |
|---|---|---|---|
| **0** | ✅ Résumé never-blank | trust fix, shipped on branch | run.ts shape-repair + recovery |
| **1** | Résumé Editor (see/edit/resolve/export) | finishes the #4/#5 trust fix | artifact edit/export APIs, editor UI |
| **2** | Goal Setter + Plan/Pace engine + Feed status & agenda | **the spine:** makes it goal-driven | goals table, lib/plan, feed rewrite |
| **3** | Application Tracker | funnel source of truth | applications table, /tracker, /api/applications |
| **4** | Apply / Send (human-gated) | **closes the loop** | /api/apply (kills the 501), tracker advance |
| **5** | Roles Workspace | effortless shortlist | /roles, rematch wiring |
| **6** | Explore Ask conversational + Login polish | fixes #1, #2 | AskRo rewrite, login UX |
| **7** | RO-everywhere dock | the ask/act layer | RoDock, /api/ro/ask |
| **8** | 15-dim self-learning + funnel calibration | sharpens fit/voice + the plan | taste_dimensions, rates.ts wiring |
| **9** | Proactive pace nudges | user chose proactive push (no guilt) | notifications + cron extension |
| **10** | App shell + full responsive/a11y pass | one nav, every device | shell, breakpoint + contrast audit |
| **11** | Stress-test harness | prove it holds | personas × edge cases × guardrails |

Slices 2→4 are the heart (goal → plan → apply → track = the working loop). 5–7 make it
pleasant; 8–9 make it smart; 10–11 make it solid everywhere.

## 6 · Guardrails enforced every slice (definition of done)

- **Human-gated:** no send tool in the agent; `/api/ro/ask` can't import one (cruiser + tests).
- **Truth-gated:** artifacts trace to the master profile; flags surfaced.
- **RLS:** goals, applications, taste are user-own; verified per table.
- **No client secrets:** `no-client-secret-imports` test stays green.
- **Responsive + a11y:** every new screen passes mobile breakpoints + focus/contrast.
- **Tests green, run sequentially** (repo corrupts under concurrent tsc/vitest).
- **Nothing merges to `main` until verified** on the `revamp/journey` branch.

## 7 · Open items to resolve at their slice

- PDF render path on Workers (slice 1).
- Public source for the funnel **priors** (slice 2).
- Nudge delivery channel, in-app now; email when Cloudflare Email is enabled (slice 9).
