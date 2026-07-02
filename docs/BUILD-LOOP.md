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

## Build order & slice board (dependencies)

Authoritative list: `docs/specs/architecture-buildplan.md` §5. **One PR per slice.** A slice
is **READY** only when every slice in its "needs" column is **merged to `main`**.

| Slice | Name | Needs (merged) | Parallel-safe with |
|---|---|---|---|
| **T** | Audit tooling + app-shell scaffold (Playwright, axe, docx, CI jobs, zod helper) | — (**do first, alone**) | — |
| 1 | Résumé Editor + export | T | 2, 5, 6 |
| 2 | Goal Setter + Plan/Pace engine + Feed status/agenda | T | 1, 5, 6 |
| 3 | Application Tracker | T, 2 | 1, 5, 6 |
| 4 | Apply / Send (human-gated) | 1, 3 | 8, 9 |
| 5 | Roles Workspace | T | 1, 2, 6 |
| 6 | Explore Ask conversational + Login polish | T | 1, 2, 5 |
| 7 | RO-everywhere dock | T + ≥1 of {1,2,5} | 3, 4 |
| 8 | 15-dim self-learning + funnel calibration | 3 | 4, 9 |
| 9 | Proactive pace nudges | 2 | 4, 8 |
| 10 | Responsive + a11y full pass | 1,2,3,5,6 | 11 |
| 11 | Stress-test harness | 1,2,3,4 | 10 |

**Slice 0** (résumé never-blank) is already built on `revamp/journey`. **T must merge before
any feature slice starts** — it provides the audit tooling every slice depends on.

## Running multiple agents in parallel (no collisions)

Two rules make N agents safe:

**1 · Never share a working directory.** Each agent runs in its **own git worktree or clone**
— never two agents in the same checkout (concurrent `tsc`/`vitest`/git in one dir corrupts
`node_modules` and git state). Setup per agent:
```
git worktree add ../roleos-agentA main     # (or a fresh clone)
cd ../roleos-agentA && npm ci
cp ../roleos/.dev.vars ../roleos/.env.local .   # secrets are gitignored — copy for local audits
```

**2 · Claim a slice atomically via git; never two agents on one slice.** Before starting:
```
git fetch --all --prune
gh pr list --state all --limit 100      # slices with a branch/PR are TAKEN
git branch -r | grep slice/             # remote claim branches
```
Pick the **lowest-numbered READY slice that has no branch and no PR**. **Immediately claim it**
by pushing the branch (`git push -u origin slice/<n>-<name>` right after `git checkout -b`),
then re-fetch and confirm you're the only claimant (if two raced, the lower agent-id yields and
picks the next READY slice). One slice = one branch = one PR = one agent, always.

**Conflict handling:** if your PR branch conflicts with a newly-merged `main`, rebase on `main`,
re-run the full audit, and update the PR. If a slice you need isn't merged yet, pick another
READY slice instead of waiting idle.

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

## THE PROMPT (paste into each agent's chat)

Give each parallel agent its own worktree/clone (see "Running multiple agents" above) and,
optionally, tell it its id in the first line ("You are agent B"). The same prompt is correct
solo or in parallel — the coordination steps are no-ops when there's only one agent.

```
You are an autonomous builder for RoleOS, working in THIS checkout (your own worktree —
never share a directory with another agent). Follow docs/BUILD-LOOP.md exactly. Loop
hands-off and STOP only at PR review/merge. If you were given an agent id, use it in logs.

Repeat forever:

A. ORIENT. Read docs/BUILD-LOOP.md (esp. the slice board + parallel rules), 
   docs/specs/architecture-buildplan.md, docs/specs/goal-engine.md, 
   docs/AUDIT-DIMENSIONS.md, docs/AUDIT-LOG.md (read the top!), and your auto-memory.

B. CLAIM a slice (atomic, no collisions):
   - git fetch --all --prune ; gh pr list --state all --limit 100 ; git branch -r | grep slice/
   - Pick the LOWEST-numbered READY slice with NO branch and NO PR. A slice is READY only
     when every slice in its "needs" column is MERGED to main. Slice T must be merged before
     any feature slice. If nothing is READY (all blocked on unmerged PRs), wait ~15 min and
     re-check — do not build on an unmet dependency.
   - git checkout main && git pull && git checkout -b slice/<n>-<name> && git push -u origin HEAD
   - Re-fetch; if another agent also claimed this slice, the higher agent-id yields and picks
     the next READY slice. One slice = one agent, always.

C. BUILD the slice to its spec + acceptance criteria. NEVER commit or merge to main.

D. AUDIT — run the full D1–D10 matrix (docs/AUDIT-DIMENSIONS.md) SEQUENTIALLY. Never run two
   tsc/vitest at once. Cover the scenario library for this surface: personas + edge/negative
   cases + cross-user RLS probe + prompt-injection + mobile 375px + keyboard/a11y. Fix until
   every dimension is green. Then adversarially self-review and fix what breaks; ensure every
   empty/error state has a way forward.

E. LOG. Prepend a dated entry to docs/AUDIT-LOG.md (built / D1–D10 findings / fixes /
   deferrals / new learnings; add durable learnings to "Standing learnings"). Update memory.

F. OPEN A PR: gh pr create --title "slice <n>: <name>" --body "<acceptance criteria checked +
   D1–D10 results + scenarios run + deferrals>". Post the PR link.

G. STOP for this slice. Do NOT merge. Do NOT build on main. Then loop back to A and claim the
   NEXT ready slice (you keep building other slices while your PR awaits human merge — you just
   never merge, and never start a slice whose dependencies aren't merged yet).

HARD STOPS — pause and ASK the human first (do not proceed): merging to main; any destructive
data op (drop/alter populated columns, delete/mass-update rows); auth/RLS/secret changes;
adding a paid service or exceeding budget; changing an invariant (human-gated-outward,
truth-gate); or any product decision not covered by the specs. Preserve every guardrail.

If you are the first/only agent and Slice T isn't merged yet, do Slice T first and stop at its
PR (everything else is blocked on it). Begin now: orient, claim, build.
```
