# RO memory — cross-screen context & personalization (design spec)

> Status: **direction approved 2026-07-26** (Option B, chosen live with the user).
> Spec written now; **build sequenced AFTER the résumé editor works** (résumé P3's
> revise-by-instruction builds the context-assembler this reuses — see
> `resume-editor-v2.md`). This is design only; no code lands from this document yet.

## The problem — RO is an amnesiac

Today "RO" looks like one assistant that follows you across screens. It isn't. It's
several **independent, stateless, one-shot** skill calls, each re-assembling its own
context from the DB at request time. There is no conversations/messages table, no
server-side thread, no shared context object. The dock (`/api/ro/ask`) knows your
pipeline but not your résumé draft or your master profile; the Explore chat
(`/api/explore/ask`) knows public roles but nothing about you, and its "memory" lives
only in that browser's localStorage. Ask RO something on one screen, move to another —
it has zero knowledge of what you just said. The continuity is a UI/voice illusion.

**The goal:** RO genuinely remembers you across screens, gets more personal the more
you use it, and improves for everyone — without the cost, latency, or "wrong-context"
failures that a naïve chat-log would cause.

## The reframe — a notebook, not a recording

The trap is "store the transcript and replay it": it blows up cost, hits context
limits, and drags stale/irrelevant context into unrelated screens (which makes an
agent feel *worse*). We reject it. RO keeps a **small, tidy notebook of lasting
facts** — not every word. Two layers:

1. **Working context** (ephemeral, rebuilt per call) — master profile + current role
   + current draft + pipeline. This is the shared **context-assembler** (`lib/ro/
   context.ts`) that résumé P3 already needs; memory reuses it. Cheap, no new storage.
2. **Durable memory** (the new part) — a **bounded, structured** set of typed notes
   RO learned about you ("targets Gen-AI PM at Scale", "prefers concise bullets",
   "asked not to surface the 2019 gap"). Not a log. This is what crosses screens.

## The three hard requirements (the user's, non-negotiable — top acceptance bars)

1. **Never surface wrong or stale context.** Resolved by: **newest-note-wins** on
   conflict, **confidence** that only hardens on *repeated* behavior (a one-off never
   becomes a "fact"), **show why** a note was recalled (visible + correctable), and the
   truth-gate still caps anything touching the résumé. "Never surfaces wrong/stale
   context" is a **measured** bar (eval ladder), not an assertion.
2. **Lose nothing.** Full history retained durably.
3. **Bounded cost/tokens.** Reconciled with #2 by the core principle —
   **store everything (cheap storage), retrieve only the few relevant notes per reply
   (bounded tokens).** Remembering ≠ reading it all.

## The five levers that make Option B cheap, safe, and scalable

| Lever | Mechanism | Cuts cost | Cuts risk |
|---|---|---|---|
| Derive from `decision_events` | Memory is mostly *computed* from events already captured (edits, approves, tunes, rejects) — the taste/outcome-learning "counting in the open" pattern — plus a small `ro_memory` table only for explicit stated prefs. | few/no new writes | grounded in real actions, auditable, append-only + RLS |
| Retrieve, don't replay | Store notes with `bge` embeddings (pgvector already in use); each call pulls the **top-k relevant** notes. | context is **O(1) per call**, not O(history) | irrelevant memory never surfaces → no cross-screen bleed |
| Rolling summary on write | For true threads, fold each new turn into a short running summary on the **cheap tier** (Haiku/`quick_tag`), keep only last *k* verbatim turns. | summarize once on write vs re-read on every read | bounded, predictable context |
| Prompt caching | Stable prefix (system + durable memory + profile) behind Anthropic prompt caching. | big input-token savings on the rarely-changing part | — |
| Scoping / namespaces | Notes scoped: global-user vs per-role vs per-artifact. Each surface reads only its scope + global. | smaller reads | contamination prevented by construction |

Net: **cost per RO call is ~constant regardless of history length**, and irrelevant
context physically can't leak in because it's never retrieved.

## Two kinds of learning

- **Personal** — your notebook → a seamless, personal RO on every screen. RLS-scoped;
  yours alone.
- **Collective (personalization at scale)** — **anonymous, aggregate** patterns across
  users ("this kind of tune tends to strengthen résumés"; "roles like X convert for
  people like Y") improve RO's *defaults* for everyone. **Never exposes anyone's
  private notes** — only derived, de-identified patterns, measured by the eval ladder.

## Data model (net-new, small)

- **`ro_memory`** (append-only, RLS per-user): `{ id, user_id, scope ('global' |
  'role:<id>' | 'artifact:<id>'), kind, text, confidence, source_event_id?, embedding
  vector(768), created_at, superseded_by? }`. Notes; newest-wins via `superseded_by` /
  recency; bounded per scope (summarize-and-drop the tail).
- **`ro_threads` / `ro_messages`** (RLS per-user): a server-side thread per surface with
  a **rolling summary** column + last-k verbatim turns. Replaces the localStorage-only
  Explore thread; unifies the dock + Explore + the résumé command bar.
- **Derived, not stored:** most personal signal stays derived from `decision_events`
  at read time (like taste), so the durable tables stay small.
- **`lib/ro/context.ts`** — the shared assembler: `(userId, scope) → { profile, role?,
  draft?, recentDecisions, memories: top-k, threadSummary? }`. One object, all surfaces.

## Guardrails / invariants

- Injected memory is **user content, treated as data, never instructions**. It can
  *suggest*, never *act*: **human-gated-outward holds** — memory can never trigger a
  send/submit. Storing more context does not widen the action surface.
- Truth-gate still caps résumé claims to `master_profile`.
- RLS + append-only on memory tables; TTL / bounded size; visible + editable ("What RO
  remembers" view, mirroring the correctable `ProfileView` from `profile-data-layer.md`).
- Collective learning is de-identified and aggregate-only; private notes never leave the
  user's scope.

## Measured, not claimed (the eval ladder)

A held-out set tracks two honest targets: (1) **recall precision** — of the notes RO
pulled for a query, how many a human judges relevant (the "never wrong/stale context"
bar); (2) **note-quality** — do derived notes match a careful human read of the user's
behavior. Model/threshold/retrieval changes ship behind this eval (the J8 §5 pattern,
same as the résumé coverage judge).

## Build phases (own slices; each ships value, de-risks the next)

- **M0 — shared working context** (`lib/ro/context.ts`). Falls out of résumé P3; makes
  the dock stop being amnesiac about your profile. Cheapest, most visible win.
- **M1 — durable structured memory**: `ro_memory` derived from `decision_events` +
  explicit prefs; top-k retrieval injected into every RO call; the "What RO remembers"
  editable view.
- **M2 — server-side threads with rolling summaries** for the dock + Explore + the
  résumé command bar (cheap-tier summarizer, cached prefix). Retires localStorage-only.
- **M3 — retrieval + calibration**: semantic recall over notes + the eval ladder +
  aggregate (anonymous) collective learning. Ships behind the eval.

## What exists vs what we build

- **Exists (reuse):** `decision_events` (append-only + derive-at-render, like taste) ·
  `bge` + pgvector recall · `callModel` metering + cost-budget · tiered models · the
  correctable-view UI pattern (`profile-data-layer.md`) · the DO/long-job pattern for
  any heavier summarization.
- **Build:** `ro_memory` + `ro_threads`/`ro_messages` tables · `lib/ro/context.ts` ·
  the retrieval + rolling-summary skills · the "What RO remembers" view · the memory
  eval ladder · aggregate collective-learning derivation.

## Sequencing

Résumé editor first (tailoring + P2 editor/export + P3 revise). M0 is produced by P3;
M1–M3 follow. Do **not** build memory before P3 — it would build the context-assembler
twice and guess at what context RO actually needs.
