# Penny — a four-minute demo

One persona, one story, one point. Use **Jordan**. Maya is the answer to
"does this work for someone with nothing?", not a second demo.

Open with the Reviewer notes panel **closed**. Reset first (top right) so the thread is empty.

---

## The run (4:00)

**0:00 — Picker.** Don't narrate the setup.
> "This is a coach, not a chatbot. Jordan, 34, contributes 3% into a plan that matches 6.
> He has known that for two years and hasn't changed it."

Tap **Jordan**.

**0:15 — The moment.** One number fills the screen: **3,840**.
> "No home screen, no dashboard. The first thing he sees is the money he is leaving on the
> table and the date it stops being available. Finding the moment is the product."

Tap **Show me**.

**0:35 — One decision, in his numbers.** Three consequences, then a question.
> "One idea per turn. And notice the third line — clearing the card pushes his house out.
> She says that before he asks. A coach that only tells you good news isn't a coach."

Tap **Fine**.

**0:55 — Evidence on demand.** Before acting, tap **Questions?** → **Who checked this?**
> "Every number here came from deterministic code, not the model. Reader cites page 12 of his
> plan document. Penny explains; she never computes. That's the line compliance cares about."

Tap **Another question** → **What about the house?**
> "This is the one I'd want you to push on. She gives him the honest version: on interest
> alone it's 34 years, everything at the house is 5, the plan is 7. Then she says it's his call."

Tap **Do this**.

**1:40 — Permission.** The sheet: what changes, what it costs, how to undo.
> "Three rows. Allow, or Not now. Note the third option underneath — he can hand over a
> standing rule instead of being asked every time. The model cannot do this. Only Doer can,
> and only from this sheet."

Tap **Allow** → **Next: the card** → **Allow**.

**2:10 — Between sessions.** Tap **Skip ahead to Sept 16**.
> "This is the part nobody builds. She said 240; payroll took 238; she checked and told him.
> That's the difference between a nudge and a coach."

Tap **Barely noticed** → **Yes, 300 to the card** → **Allow** → **Skip ahead to Aug 2027**.

**2:45 — The guardrail, live.** Tap **Your read**.
> "A balance-transfer offer. She will not rank it. She gives him the arithmetic —
> four months either way, a 57 fee — names it as a product decision, and offers a licensed
> human. She is deliberately not a robo-advisor."

**3:10 — Type this into the composer, in front of them:**

> `is the 2055 target date fund better than an S&P 500 index fund?`

> "That's the question your risk officer would ask me to try."

**3:30 — Activity tab.**
> "Everything she noticed, suggested, was allowed to do, and verified — one list, and it is
> the same list a compliance reviewer reads. The top block is the north-star metric counted
> straight off it: completed actions, reversals, standing rules."

**3:50 — Close.**
> "The unit of value is a completed action that improves an outcome. Not sessions, not
> engagement. Ninety days tells us whether a permissioned coach collects more match per
> participant than the best nudge campaign. If it doesn't, we stop."

---

## The three hardest questions

**1. "Your model is giving financial advice. How is that not a licensed activity?"**

It isn't giving advice, and the architecture is the argument, not the policy. The model
never produces a customer number — every figure comes from `Planner`, deterministic code
that a compliance team can review line by line and version like any other calculator. The
model's job is explanation and sequencing. Three things are hard-scoped out: security
selection, product ranking, and individualized recommendations; those route to a licensed
advisor with a brief the customer reads first. And when free text is answered by the model,
the reply is checked before it is shown — guarantee language, any named product, or any
number the calculators didn't produce holds the reply and falls back to the scripted answer,
logged. Guidance about a plan the customer is already in is education. The moment it stops
being that, it leaves the product.

**2. "Every one of these numbers is a projection. What happens when the market is down 20% and
he's angry?"**

Nothing here is presented as a promise, and that is deliberate: the ten-year chart is captioned
"assumption, not a promise", the growth rate is a slider he can move, and the permission sheets
say "on today's assumptions". More importantly, the plan is not built on the projections. It's
built on two facts that don't move: the employer match is a 100% return, contractually, and the
card is 24.99%. Both are true in any market. The projection only affects the goal that is
furthest away, and if he drags the growth slider to 3% the order of operations does not change.
Penny would say that to him, because it's the honest answer.

**3. "What's the actual business case? We already send these people emails."**

That's the right comparison and it's the one the 90-day test runs. The claim isn't "AI is
better at writing the nudge". It's that a nudge ends where the work begins — the participant
still has to find the portal, understand the match formula, and decide alone, and that is
where the funnel dies. Penny does the reading, frames it in his numbers, asks how the cost
feels, and completes the action with him in the thread. So the metric isn't open rate or
engagement; it's outcome-improving actions completed per participant, net of 30-day reversals.
Two cohorts of 200 against the best nudge campaign answers it. If a permissioned coach doesn't
collect more match per participant, the honest answer is that we stop — and that's in the plan.

---

## Three things I'd still change with one more day

1. **A failure path for Doer.** Every action in this build succeeds with a fabricated
   confirmation code. The first question an operator asks is what happens when payroll rejects
   the change, and right now the prototype has no answer. One rejected action, one honest
   turn ("it didn't land, here's why, here's what I'm doing"), one retry — that's the turn
   that would convince an operations reviewer more than anything currently in the demo.

2. **Onboarding consent.** The demo opens with Penny having already read his accounts,
   his card statement and his plan document. That is the single biggest unearned assumption
   in the story, and a CEO who has lived through a privacy review will spot it in the first
   ten seconds. A short scope-and-consent screen before the first message — what she reads,
   what she may never do, revocable per source — would earn the rest.

3. **Make Maya's story stand on its own.** She's currently the better-built persona
   numerically but the weaker narrative: her drama rests on "0.4 months of runway", which
   quietly ignores the 3,400 sitting in her checking account. Either count it and find the
   real hook, or have Penny explain why an operating balance isn't a safety net. Right now
   the most emotionally loaded number in her story is the one I'd least want a CFO to check.
