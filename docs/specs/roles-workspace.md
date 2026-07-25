# PRD - Roles Workspace

> Status: **DRAFT for build** · Roadmap slot: **Now #1** · Owner: Nik
> Journey stage: Discover + Match (stages 1–2). Supersedes the one-shot match list.

## Problem statement

After onboarding, RO returns a strong but **static** list of match cards. The user
can't sort, filter, save, dismiss, compare, or re-rank - so the moment the list
appears, momentum stops. Separately, `/explore` lets anyone browse the corpus but
with **no personal fit**, so "browsing roles" and "my matches" are two disconnected
worlds. The result: a user who wants to *work a shortlist* has nowhere to do it, and
a user who wants to *explore more* drops out of their personalized context.

## Goals

1. A signed-in user can go from "here are my matches" to a **worked, prioritized
   shortlist** in one surface, without leaving to a second tool.
2. Every role in the corpus is viewable **with the user's fit attached** - browsing
   and matching become one experience.
3. Re-ranking on new signal (dismiss, save, edit profile) feels **live**, not a
   restart of onboarding.
4. Measurable: **≥60%** of users who reach the workspace take at least one curating
   action (save/dismiss/filter) in their first session; **≥3** roles advanced to
   "pursuing" per active user in week one.

## Non-goals

- **Applying / sending** - that's the Apply spec (Next). This surface ends at
  "pursue this" handoff to the résumé/studio.
- **Re-running the full Opus onboarding reasoning** on every interaction - too slow
  and costly; we re-rank over the already-reasoned shortlist (`/api/rematch`).
- **New corpus ingestion** - out of scope; the workspace reads existing `roles`.
- **Team/shared shortlists** - single-user only for v1.

## User stories

- As a **job seeker**, I want to sort my matches by fit, comp, recency, or stage so
  I can decide what to work first.
- As a **job seeker**, I want to **save** promising roles and **dismiss** wrong ones
  so my list sharpens instead of staying noisy.
- As a **job seeker**, I want to see **why RO ranked a role for me** (the calibrated
  reasons + gaps) inline, so I trust the order.
- As a **job seeker**, I want to browse *beyond* my top matches - the whole index -
  but still see my fit on each, so exploring doesn't lose my context.
- As a **returning user**, I want the list to **re-rank when I dismiss or update my
  profile**, so it reflects my latest signal without a full re-onboard.
- As a **job seeker on mobile**, I want the workspace to collapse to a single scannable
  column so I can triage on my phone.

## Requirements

### Must-have (P0)

| # | Requirement | Acceptance criteria |
|---|---|---|
| P0-1 | **Board of match cards** with fit score, verdict (pursue/maybe/skip), company, title, location, comp (if known). | Given saved matches, when I open the workspace, then each role shows fit + verdict + the reason RO gave. |
| P0-2 | **Sort** by fit, recency, verdict. | When I change sort, the list reorders without a full page reload. |
| P0-3 | **Filter** by verdict, location/remote, company stage, and free-text company. | Filters combine (AND); an empty result shows an honest empty state, not a spinner. |
| P0-4 | **Save** and **Dismiss** a role; both write a `decision_event` (append-only). | Dismissed roles leave the active list; saved roles get a "pursuing" chip; both survive reload (RLS-scoped read). |
| P0-5 | **Why-this-fits** detail: expand a card to the calibrated reasons + gaps from the match skill. | Every card can expand inline; content is the stored match rationale, no new model call. |
| P0-6 | **Live re-rank** via `/api/rematch` after dismiss or profile edit. | After I dismiss 2 roles, remaining order updates within ~2s using the existing rematch path, no onboarding re-run. |
| P0-7 | **Fit-on-browse**: entering `/explore` while signed in shows my fit badge on each role. | A signed-in user sees a per-role fit indicator across the index; anon users see the index unchanged. |

### Should-have (P1)

- **Compare** 2–3 saved roles side by side (fit, must-haves, gaps).
- **Notes** per role (free text, RLS-scoped).
- **Bulk dismiss** from a filtered view.
- Saved-search / "watch this filter" handoff into the existing `/watch` demand capture.

### Could-have / future (P2)

- Fit **explanation diff** when re-rank moves a role ("moved up because you dismissed X").
- Group by company; company-level fit rollup.
- Keyboard triage (j/k to move, s to save, x to dismiss).

## Design intent

- The workspace **is the home for stage 1–2** and lives inside the new app shell
  (left rail: Feed · **Roles** · Résumé · Studio · Watch). "Pursue" on a card is the
  bridge to stage 3 (résumé/studio).
- Reuse, don't rebuild: match rationale is already stored; `/api/rematch` already
  exists; `decision_events` already append-only under RLS. This is largely a **read +
  curate + re-rank UI**, not new agent work.

## Success metrics

**Leading:** curating-action rate (≥60% first session); dismiss→re-rank round trips;
`/explore`-with-fit engagement vs anon explore. **Lagging:** roles advanced to
"pursuing" per user; onboarding→workspace→résumé conversion; 4-week retention of users
who worked a shortlist vs. those who saw the old static list.

## Open questions

- **(data)** Do we have reliable comp on enough roles to sort by it, or is comp a P1
  filter only where present?
- **(eng)** Does `/api/rematch` return enough to re-rank client-side, or do we page?
- **(design)** Fit badge on `/explore` for anon users - teaser ("sign in to see your
  fit") or hidden entirely?

## Timeline / phasing

**Phase A (P0-1..6):** the authenticated board + curate + live re-rank - the core value.
**Phase B (P0-7 + P1):** fit-on-browse across `/explore` + compare/notes. Phase A is
shippable alone and is the higher-leverage half.
