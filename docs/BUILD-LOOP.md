# The Autonomous Build Loop

> A standing operating contract for building RoleOS slice-by-slice, hands-off, **stopping
> only for your PR review/merge**. Paste the prompt at the bottom into a new Claude Code
> chat opened in the `roleos/` repo.

## The one human gate

The loop is fully autonomous **except merging to `main`**. It builds on a branch, runs the
full audit, opens a **PR**, and **stops**. You review and merge (or request changes). Merge
to `main` auto-deploys (`deploy.yml`). Nothing reaches `ro.roleos.fyi` without your merge.

## Hard stops — the loop must PAUSE and ask before:

1. **Merging to `main`** (always — this is the gate).
2. Any **destructive data op** (dropping/altering columns with data, deleting rows, mass updates).
3. **Auth / RLS semantic changes**, secret handling, or anything that could expose data.
4. **Spending beyond budget** or adding a paid service (CF Containers, Browser Rendering, etc.).
5. **Changing an invariant** (human-gated-outward, truth-gate) — flag, don't "fix".
6. A slice needs a **product decision** not covered by the specs → ask, don't guess.

## Per-iteration algorithm

1. **Orient.** Read `docs/specs/architecture-buildplan.md` (build order),
   `docs/specs/goal-engine.md`, `docs/AUDIT-DIMENSIONS.md`, `docs/AUDIT-LOG.md` (learnings so
   far), and auto-memory. Find the **next unstarted slice** (or resume the in-progress one).
2. **Branch.** `git checkout main && git pull && git checkout -b slice/<n>-<name>`. Never
   commit to `main`.
3. **Build** the slice against its spec + acceptance criteria. Thin, coherent commits.
4. **Audit — run D1–D10** (`docs/AUDIT-DIMENSIONS.md`) **sequentially** (never concurrent
   tsc/vitest — it corrupts node_modules). Fix until green. Cover the scenario library for
   this surface (personas + edge/negative + cross-user RLS + injection + mobile + a11y).
5. **Self-review** as an adversary: try to break it, probe the guardrails, check every empty/
   error state has a way forward. Fix what you find.
6. **Log.** Prepend an entry to `docs/AUDIT-LOG.md`: what was built, what each dimension
   found, what was fixed, anything deferred, and **new learnings** (so the next slice inherits
   them). Update auto-memory.
7. **Open the PR.** `gh pr create` with: the slice, the acceptance criteria checked, the
   D1–D10 results, screenshots/notes, and any deferrals. Title `slice N: <name>`.
8. **STOP.** Post the PR link, then pause for human review/merge. Do **not** start the next
   slice's work on `main` (main is stale until merge). While waiting you may open a *draft*
   follow-up branched off the PR branch, but never merge and never assume approval.
9. **On merge** (you're told it merged, or you detect it): pull `main`, go to step 1.

## Build order

Authoritative list lives in `docs/specs/architecture-buildplan.md` §5. Do **Slice T (audit
tooling)** first (Playwright + axe + docx + CI jobs + zod validation helper), then slices 1→11.
One PR per slice. If a slice is large, split into sub-PRs but keep each independently green.

## Guardrails baked into every PR (never regress)

Human-gated outward (no send tool; cruiser + tests green) · truth-gated artifacts · RLS on
every user table · no client secrets · responsive + a11y · all invariant tests green · every
model call metered · checks run sequentially.

## How to launch

**Option A — a working loop in a chat (recommended for supervised runs).** Open a new Claude
Code chat in `roleos/` and paste the prompt below, then let it run. It builds a slice, opens a
PR, and stops. After you merge, say `continue` (or it resumes on its next scheduled wake).

**Option B — scheduled 24×7.** Register it as a recurring cloud agent (the `schedule` skill /
a routine) firing e.g. hourly: each run advances the current slice or, if a PR is open and
unmerged, checks status and otherwise waits. It never merges — so it's safe to run unattended.

---

## THE PROMPT (paste into a new chat)

```
You are the autonomous builder for RoleOS, working in this repo. Follow
docs/BUILD-LOOP.md exactly. Loop, hands-off, and STOP only at PR review/merge.

Each iteration:
1. Read docs/specs/architecture-buildplan.md (build order + data model),
   docs/specs/goal-engine.md, docs/AUDIT-DIMENSIONS.md, docs/AUDIT-LOG.md, and your
   auto-memory. Pick the next unstarted slice (Slice T — audit tooling — comes first).
2. Branch off main: git checkout main && git pull && git checkout -b slice/<n>-<name>.
   NEVER commit or merge to main.
3. Build the slice to its spec + acceptance criteria.
4. Run the full audit matrix D1–D10 (docs/AUDIT-DIMENSIONS.md) SEQUENTIALLY — never run
   two tsc/vitest at once (it corrupts node_modules). Cover the scenario library for this
   surface: personas, edge/negative cases, cross-user RLS probe, prompt-injection, mobile
   375px, and a11y. Fix until every dimension is green.
5. Adversarially self-review; fix what breaks. Ensure every empty/error state has a way forward.
6. Prepend a dated entry to docs/AUDIT-LOG.md (built / findings per dimension / fixes /
   deferrals / new learnings) and update auto-memory.
7. Open a PR with gh: title "slice <n>: <name>", body = acceptance criteria checked +
   D1–D10 results + notes + deferrals. Post the PR link.
8. STOP. Do not merge. Do not build on main. Wait for the human to merge or comment.
   When told it's merged, pull main and start the next slice.

HARD STOPS — pause and ask first: merging to main; destructive data ops; auth/RLS/secret
changes; adding a paid service or exceeding budget; changing an invariant; any product
decision not covered by the specs. Preserve every guardrail in docs/BUILD-LOOP.md.

Start now with Slice T (audit tooling). Report the plan for it, then build.
```
