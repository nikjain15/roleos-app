# Design PRD, CORE · Résumé editor + per-role tailoring (the flagship craft)

> Status: **APPROVED design → READY to build** (human approved 2026-07-05, design-depth loop).
> Visual + microcopy source of truth: **https://roleos.fyi/proto/resume-editor/** (4 personas,
> concise/detailed toggle, 1-by-1 change walker) · decisions:
> https://roleos.fyi/proto/resume-editor/decisions.html (v0.2)
> **EXTENDS the live slice-1/3 editor** (`components/ResumeEditor.tsx`, `/api/tailor`,
> truth-gate), §7 diffs kept-vs-new precisely so the builder extends, never rebuilds.

## 1 · Problem, goal & the world-class bar (CORE)

The live editor is honest and capable but fragment-shaped and silent about its reasoning.
The bar (human-set): **truth + taste + honestly out-ATS-ing the ATS tools.** Beat Teal/Rezi
by making must-have coverage a visible capability built ONLY from real experience (their
keyword-stuffed output dies in interviews); beat ChatGPT by remembering, every edit
compounds into voice and master. Success: résumés that survive the interview room, users who
can explain every line, edit rates that show real ownership, and robot-view coverage lifting
without a single fabricated claim.

## 2 · Confirmed intent (human-signed, 2026-07-05)

Opens as ONE clean, complete document, the tailored résumé, all years, readable as a
recruiter would, with quiet typed dots on changed lines; all intelligence behind lenses
opened one at a time (What changed & why · Compare with master · Robot view); RO orients
once in three lines. Every change explains itself in plain English at the user's chosen
depth (concise/detailed toggle, persisted). Editing is primarily the **1-by-1 change
walker** (feedback round 1): each change as its own step, master's version → hers in an
editable box → the why → keep / save-my-edit / revert, pausable, place held. Truth flags
stay resolvable in place; edits clear their own flags. Master upgrades are proposed, never
silent. Export unlocks when every line is grounded.

## 3 · Behavior spec (copy verbatim from the prototype)

**Calm default:** full tailored document, typed dots only (blue why · amber truth flag ·
green suggestion · pencil private note). Honest header count ("2 need your eyes" → "All
clear"), never alarm badges. Once-only 3-line orientation (+ "show me around slowly" path).

**Lenses (one at a time):** *What changed & why*: all changes as reading material at the
toggle's depth, incl. the mechanical-summary line. *Compare with master*: both COMPLETE
documents side by side, changes highlighted, nothing silently dropped (mobile: swipe
between, never shrunken panes). *Robot view*: per-must-have coverage in three honest states
(covered-from-real-work / adjacent-framed-honestly / missing-and-not-faked); weak coverage →
she offers fixes using only real experience; no numeric score theater.

**The change walker:** "Review 1-by-1" prominent on the default view. Per step: before /
editable after / why (toggle-aware) / keep · save-my-edit · revert-to-master · pause (place
held, no nagging). Completing: "this résumé is fully yours now."

**Comment queue:** actionables (flags, then suggestions) arrive one at a time; "later"
always allowed; resolved comments leave the document (history in the changes lens).
Flag resolution: take-hers / edit (clears flag, you own your claims) / keep-mine (allowed,
noted in flag history; export unlocks, your claim, your call, human-confirmed).

**Master upgrades & voice:** an edit that beats the master triggers propose-and-approve
("want it in your master?"); the master never mutates silently. Every edit = high-weight
voice-lesson decision event; her drafts converge on the user's writing; named to the user.

**Narration depth:** concise/detailed toggle persisted in profile prefs; detailed mode may
teach recruiting psychology (human-accepted; keep it plain-English, jargon-blocklisted).

## 4 · System requirements inherited (J8)

Verified-before-shown applies to tailoring output (already gated: `gate: "full"`); the
wrong-answer/"not right?" affordance ships on every why and suggestion. Truth gate re-runs
on user edits before export (J6 rule shared here).

## 5 · Data & guardrails

Decision events: walker outcomes (keep/edit/revert per change), flag resolutions (keep-mine
logged distinctly), master-upgrade accept/decline, toggle preference, robot-fix accepts.
Truth gate: unchanged v1 mechanics + the three-state robot honesty; no unlabeled claims.
Export: DOCX/PDF kept; grounded-gated. Warm-copy + calm-UX rules on every string/surface.

## 6 · Acceptance criteria (Definition of Done)

1. Calm default + 4 lenses at 375/768/1280, axe-clean; orientation once-only; dots typed.
2. Walker: steps through ALL real changes with live editing; pause/resume holds place;
   outcomes write correct events; edits re-run truth gate.
3. Toggle persists and switches every why/changes-lens text; both depths pass the jargon
   blocklist.
4. Robot view renders real must-have extraction with three honest states; fix-offers apply
   visible changes; no fabricated coverage possible (test: a missing skill can never move
   to "covered" without a profile edit).
5. Compare lens renders both complete documents from real data; highlight parity with the
   actual diff.
6. Master proposals fire on qualifying edits; accept updates master + all future tailoring
   baselines; decline leaves variant-only. Export gating incl. keep-mine path.
7. **Tests (ratchet, net-new):** unit: dot-typing; walker state machine; toggle
   persistence; robot three-state mapper; upgrade-qualifier. E2E: all four proto personas;
   full walker cycle incl. pause; flag keep-mine → export. Invariant suites stay green.

## 7 · Extends vs exists (builder contract)

**KEPT (do not rebuild):** master-as-source-of-truth model · truth-flag mechanics +
edit-clears-flag · autosave · DOCX (server, Packer.toBase64String) + PDF (client print) ·
grounded/needs-eyes status · `/api/tailor` + `tailor_resume` skill + quality gate.
**NEW:** full-document rendering both sides · lens architecture + calm default · typed
comment system + one-at-a-time queue · 1-by-1 change walker · concise/detailed toggle ·
robot view (three honest states + fix offers) · master-upgrade proposals · voice-learning
capture · once-only orientation · "not right?" affordance on narration.

## 8 · Non-goals

Layout/typography design tools (export templates' job) · cover letters (J10, next) ·
numeric ATS scores (rejected, three honest states instead) · auto-mutating the master
(rejected on principle).
