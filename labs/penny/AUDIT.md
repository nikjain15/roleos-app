# Penny — pre-demo audit

Audited against `labs/penny/app/index.html` at commit `732d9e2`. Every number below was
recomputed from the persona data using the app's own `Planner` functions; every interaction
claim was reproduced in headless Chromium (Playwright) at 390px and 1280px.

Severity: **blocker** = would derail the demo or falsify the core claim. **major** = a CEO
would notice and it costs credibility. **minor** = polish.

---

## Blockers

### B1 · The permission sheet is not what gets executed
**Where:** Jordan → Show me → Fine → Do this → (open Plan, move the 401(k) slider) → back to Penny → Allow.
**What a CEO would say:** "You just showed me a consent screen that said 6% and then did 10%. That is the whole product."
**Evidence:** `decide()` reads `S.tryit.contribPct` at click time, not the value the sheet was rendered with. Reproduced:
```
perm shown: "Raise your 401(k) to 6%"  rows=[["Take-home","about 240 a month less"]]
after Allow -> plan.contribPct=10  live=10  actionTitle="Raise 401(k) to 6%"
activity log: [{"k":"action","t":"401(k) raised to 10%."}]
```
The sheet, the action title and the audit log all disagree. **Fix:** freeze the value on the
permission block when it is created (`T.perm(..., payload)`) and have `decide()` execute only
that payload.

### B2 · "What about the house?" answers "about Infinity years"
**Where:** Jordan → Show me → Fine → Questions? → What about the house?
**Evidence:** `Planner.monthsTo` returns `Infinity` whenever `monthly <= 0`, ignoring that
interest alone reaches the target. `d.homeMonths = monthsTo(60000, 14500, 0, 0.042)` → `Infinity`
→ rendered as *"the home fund reaches 60k in about Infinity years at 4.2%."*
**Fix:** only return `Infinity` when `monthly <= 0 && apy <= 0`; otherwise let the loop run
(14,500 at 4.2% reaches 60k in 407 months ≈ 34 years).

### B3 · Jordan's Money tab contradicts itself three ways
**Where:** Jordan → Money (at any point).
**What a CEO would say:** "Which of these three numbers is his spending?"
**Evidence:** categories total **4,750**; the cash-flow chart shows money out of **6,650 / 6,980 / 6,720**
(avg 6,783); the caption says *"What is left is the 650 Penny works with"* — but 7,400 − 4,750 = **2,650**.
About 2,030 a month is unaccounted for. The "Who checked this?" panel compounds it:
*"about 650 free a month after essentials and your buffer"* while essentials are stated as 4,600
(7,400 − 4,600 = 2,800). Maya's equivalent data reconciles exactly (3,880 categories = 3,887
cash-out = 4,300 − 420 free), which makes Jordan's the odd one out.
**Fix:** rebuild Jordan's category list so it sums to the cash-out figure and leaves 650.

### B4 · Both personas' closing screens contradict the story just told
**Where:** the last tap of each demo.
**Evidence (Maya, "See how far you came" → Money, July 2028):** the 401(k) row reads
**"eligible, not enrolled"** while showing **9,800**; savings still labelled **"big bank, 0.5%"**
after Penny opened a 4.2% account; student loans frozen at **−28,400** after 22 months of 310/mo.
**Evidence (Jordan, March 2029):** 401(k) still **41,000** after 2.5 years at 6% + 6% match;
net worth **85.9k** sitting directly above a twelve-month chart ending at **67.2k**; card-balance
chart ends at 6.8k while the card is at zero; cash flow still labelled Jun/Jul/Aug and accounts
"read this morning".
**Fix:** drive account labels and balances from `S.live`, advance balances on each time jump, and
rebase the twelve-month history on the current date.

### B5 · The guardrail that matters most is a narrow regex — and it is what GitHub Pages serves
**Where:** type into the composer on the static build (no `window.claude`, so always scripted).
**Evidence:** these all fall through to a generic paragraph about free cash, with no escalation:
- *"is the Fidelity 2055 target date fund better than an S&P 500 index fund?"* — the single most likely question in the room
- *"rank my options for me"*
- *"can you just move 500 into my 401k right now"* / *"just enroll me now without asking"*
- *"what return will I get if I do this?"* / *"guarantee me this works"*

Only `(which|what|best) (fund|etf|stock|index)|pick (a|the) (fund|stock)|invest in|should i buy` escalates.
**Fix:** widen to product/ranking/comparison/guarantee/act-without-permission intents, and add
explicit refusals for "move money now" and "promise me a return".

### B6 · Jordan's home-fund timeline is wrong in four places and they disagree with each other
**Evidence:**
| Claim in the product | Actual (Planner) |
|---|---|
| perm a3: "60k reached — around mid 2031" | 70 months from Jan 2028 = **Oct 2033** |
| Mar 2029: "about 14 months from 60k" | **51 months** |
| Decide turn: "Home in roughly 5 years instead of 4" | plan ≈ **7.2 years**; house-first ≈ **4.9 years** |
| Balances: 14,500 → 15,800 (Jan 28) → 26,900 (Mar 29) | 15,334 and 23,897 at the stated 510/mo |

**Fix:** compute these from `Planner` rather than hardcoding, and reconcile the balances.

---

## Majors

**M1 · Tapping the persona you are already on wipes the journey.** 7 turns → 1, no confirmation.
Tapping Jordan then Maya quickly races two `startMoment` calls (thread=2). Demo-fatal if the
presenter fidgets. *Fix: confirm before discarding; ignore a re-tap of the current persona; guard the timer.*

**M2 · A saved state from an older build white-screens the app.** `load()` validates only the
persona key. Reproduced: `[pageerror] Cannot read properties of undefined (reading 'contribPct')`,
blank phone. Any fix shipped after a reviewer has opened the page will do this to them.
*Fix: version the storage key and validate the shape.*

**M3 · "Something else" and "Something is wrong" are dead ends.** Both return **0 turns**. Worse,
`chip()` ends with an unconditional `renderPhone()` that wipes the placeholder `focusComposer()`
just set — measured placeholder after the tap is still "Ask Penny anything". "Something else" also
marks the choices block used, so the entire question menu vanishes with nothing in its place.

**M4 · The balance-transfer episode gets its own arithmetic wrong.** *"at 510 a month your card is
gone in six months anyway"* — it is **4** months on 1,900 (3 if the raise was applied).
*"a transfer fee of 3% is about 100"* — 3% of 1,900 is **57**. This is the turn where Penny is
demonstrating that she can be trusted near a product decision.

**M5 · The job-loss what-if contradicts itself on screen.** The table says "Runway today 2.0 mo →
2.0 mo"; the note underneath says Penny "stretches runway to about **4 months**". 9,000 / 4,600 = 1.96,
and pausing all 540 of extras only reaches 2.2. Same false claim in the `job_go` turn.

**M6 · "A baby" clamps a deficit to zero.** Essentials +900 against 650 free is **−250**; the table
prints "Free each month 650 → **0**" via `Math.max(0, …)`. Maya's shows 420 → 0 when it is −480.
Hiding a shortfall is the one thing this product cannot do.

**M7 · The compare table mixes two match bases in one sentence.** *"Employer adds **3,840** a year.
At 6% growth that could be around **101k** in ten years"* — the 101k is built from 7,680/yr
(`matchGain(income, 0, 6, 6)`), the 3,840 from the 3%→6% delta. 3,840 compounded for ten years is 50.6k.

**M8 · Runway ignores checking.** Maya's hook is *"0.4 months your savings would cover"* while she
holds **3,400 in checking** against a 1,000 buffer — her real runway is ~1.5 months. Jordan's 2.0
is really 2.9. The most emotionally loaded number in the demo overstates the danger.

**M9 · The recruiter episode is unreachable dead code**, yet the reviewer notes list "a recruiter"
in both the episode list and the guided path. Because it is the only path that creates one, the
demo never shows a **standing rule** — a core part of the trust model. `Standing rules: none` at the end.

**M10 · Undo is offered forever, reverts nothing for half the actions, and lies.** `undo()` handles
`a1/m1/a2/m2` only — `undo('m3')` leaves `plan.autosave` at 530. Undoing the enrolment in June 2027
still says *"Undone. Nothing else changed."* after nine months of contributions.

**M11 · Maya's memory is pre-seeded with things she only says later.** Before she attaches anything,
the You tab already shows *"Keep 1,000 in checking · you · Sept 2026"* (the answer to a question
asked three taps later), *"Match: 100% up to 4% · plan document, p.9"* (before Reader reads it) and
*"Essentials about 3,000 · 90 days of spending"* (before Analyst runs) — for a persona described as
having *"never acted"*.

**M12 · The advisor brief is promised and does not exist.** *"A brief is ready … and you can read it
first"* — there is no way to read it. The advisor booking is also the **last turn of Jordan's demo**
and offers no next step, ending the story on a dead stop.

**M13 · The 5% path breaks at the first time jump.** `jordanAway1` hardcodes *"You are at 6% …
employer added 320 … take-home was 238 lower"* even after the customer chose 5%. Maya's equivalent
correctly branches on the chosen rate.

**M14 · Maya's raise is quoted gross, Jordan's net.** Her income moves 72k→78k = 500/mo **gross**
(~395 net). Penny says *"about 500 a month"* then *"send 60% of it"* — but the action adds 300,
which is 76% of what she actually receives. Jordan's version correctly says "after tax".

**M15 · The scripted fallback repeats one paragraph verbatim.** Three different questions in a row
return the identical free-cash paragraph. In a demo that reads as broken.

**M16 · Horizontal scroll on mobile.** At 390px the document scrolls to **412px** — `.top .right`
(persona toggle + Reset + Reviewer notes) overflows. Every tab affected.

**M17 · "Not now" is a 23px target beside a 46px "Allow".** Measured: `Not now [64x23]`,
`set a standing rule [117x19]`, persona toggles `[65x30]`. Making the decline path physically harder
to hit is exactly the pattern this product claims not to be.

**M18 · Muted text fails WCAG AA.** `--muted #8A8EA3` on white is **3.24:1** (3.03:1 on the ground),
used for the tab labels, all source citations, chart labels and every `.xs` line at 10.5–12px.

**M19 · The compliance log is ambiguous and duplicated.** Dates run "Sept 16", "Dec 4", "Aug 27",
"Aug 2027", "Jan 9 28", "Mar 29" in one list — "Aug 27" means August 2027 but reads as 27 August.
The raise also logs two "Done" rows for one action. The tab claims *"A compliance reviewer sees this same list."*

**M20 · Gaps a Head of Product would be asked about.** No onboarding consent or data-permission
grant (Penny has already read everything on turn one; "Disconnect one / Export / Delete everything"
are dead buttons). No failure state for Doer — every action succeeds with a fabricated confirmation
code; nothing shows what happens when payroll rejects the change. No quiet hours or notification
settings despite the notes claiming them. Memory can be forgotten but not corrected — typing
*"my rent is actually 1750 not 1650"* returns the generic paragraph. Nothing instruments the
north-star metric (no record of "projection improved", no 30-day reversal window). No Roth vs
pre-tax question, though the whole take-home calculation assumes pre-tax deferral.

**M21 · Reviewer notes contain stale claims.** "a recruiter" (unreachable), "Quiet hours" (absent),
"Memory is visible, cited, **editable**" (delete-only), "An eval suite runs on every prompt change"
(none exists), "Every tap returns exactly one thing **and offers the next step**" (violated by
`else`, `keep`, `notyet`, `undo`, the advisor result, and every free-text reply).

---

## Minors

- Plan tab prints "Employer match — **6** of 6%" (missing `%`).
- Jordan's plan stays "**v3**" through four applied actions; the step label keeps saying "Clear the card, 810 a month" after the card is cleared.
- `Disconnect one` / `Export` / `Delete everything` have no handlers.
- Minus signs disagree: the net-worth stat uses `−6.1k`, the chart label `-25.2k`.
- Dragging Jordan's 401(k) slider to 0% shows "0 match a year / 0 take-home lower" — dropping from 3% to 0% is presented as costing nothing.
- Cash flow is permanently "last three months / Jun, Jul, Aug" and accounts "read this morning", in 2029.
- Dead code: `(p.id === 'jordan' ? 0 : 0)` in the job-loss scenario.
- `mayaAttach` labels the turn "reading" but renders the result instantly.
- `README.md` calls the tabs "Overview, Plan, Actions, and You"; they are Money, Plan, Activity, You.
- Maya is offered "Put it on a card instead" and told "a card at 24% would cost more" — she has no card in her accounts.
- The page depends on Google Fonts; offline it logs `ERR_CONNECTION_RESET` and falls back.
- Jordan's match is cited from an SPD "read Sept 2025" during the Sept 2026 benefits window.
- No IRS deferral limit anywhere; Maya being "eligible, not enrolled" ignores that auto-enrolment is now the default for new plans.
- `car_card` instructs rather than suggests: "**Pay it from the fund**".
- Permission sheets state projections as facts ("60k reached — around mid 2031") without the "assumption, not a promise" label used everywhere else.

---

## Live-reply path (item 13)

`RULES` is sound in spirit but has three holes against the calculators:

1. **Rule 1 says "use ONLY numbers in FACTS", but FACTS omits numbers the thread quotes** —
   there is no `home_months`, no payoff at other payment levels, no scenario output. A live reply
   asked "when do I get the house?" has no grounded number and must either refuse or invent one.
2. **Nothing forbids arithmetic on FACTS.** "Use only numbers in FACTS" does not stop the model
   combining them ("6,800 at 24.99% is about 1,700 a year, so over five years…").
3. **No post-check.** The reply is rendered verbatim. A single "guaranteed" or a fund name ships.

Proposed: add the missing Planner outputs to FACTS, forbid deriving new figures, and add a
deterministic post-check that scans the reply for banned language (guarantee/promise/risk-free),
fund and ticker shapes, and any number not present in FACTS — falling back to the scripted answer
when it trips.

---

## What changed (Phase 2)

Worked blocker → minor; the browser walkthrough was re-run after each batch.

**Blockers**
- `T.perm` now carries the payload it was rendered with, and `decide()` executes only that
  payload. The sheet, the action title and the audit log can no longer disagree.
- `Planner.monthsTo` returns `Infinity` only when there is genuinely no path to the target.
- Jordan's categories, cash flow and net-worth history now reconcile to the same 650 of free cash.
- Account rows read their label and balance from live state; balances advance at every time jump
  and the history charts extend with them, so no closing screen contradicts its own story.
- Guardrails widened from one narrow pattern to four intents — product, ranking, act-without-
  permission, guarantee — each with its own refusal and a Guardian line.
- Every home-fund timeline is computed. The honest arithmetic moved Jordan's final beat from
  Mar 2029 to Jul 2032; the demo now says the house slips rather than pretending it does not.

**Majors** — persona re-tap and double-tap guarded; storage versioned and shape-checked with a
render fallback so a stale state can never white-screen; "Something else" and "Something is wrong"
return a turn and keep their placeholder; balance-transfer and job-loss arithmetic corrected;
the "baby" scenario shows a deficit as a deficit; one match base per sentence; runway claims
made truthful; the recruiter beat routed in and re-grounded so Penny no longer claims to have
read his email; Maya's memory and sources now fill up as she earns them; undo reverts every
action and tells the truth once time has passed; the advisor brief is readable; the 5% path
survives the first time jump; Maya's raise is quoted the way it lands; mobile overflow, 44px
tap targets on every decline and undo, and `--muted` raised to 4.95:1 (was 3.24:1).

**Live-reply path** — FACTS gained the home timelines; rule 1 forbids arithmetic; rule 6 forbids
naming a product; and `violation()` holds any reply containing guarantee language, a named
product, or a number Planner did not produce, falling back to the scripted answer and logging it.

**Two claims made real rather than softened** — quiet hours and the back-off now appear in You;
the north-star metric is counted in Activity off the same log a compliance reviewer reads.

**Still open** (see `DEMO.md`) — no failure path for Doer, no onboarding consent step, and
Maya's headline runway number still ignores her checking balance.
