# Decision Log

> Why things are the way they are. Assumptions made, decisions taken or defended, and
> scope deliberately cut. Newest entry first.
>
> **Relationship to `docs/AUDIT-LOG.md`:** that file is the per-slice build record (what
> shipped, which of the ten audit dimensions passed, what was deferred) and it already
> carries the standing learnings every slice inherits. It stays the source of truth for
> slice history and regression guards. This file records the *reasoning* behind
> cross-cutting decisions, especially ones taken outside a slice. Where they overlap, read
> `AUDIT-LOG.md` for what happened and this file for why. Do not duplicate entries between
> them; cross-reference instead.

---

## 2026-08-02 · Security hardening: expiring allowlist, secret scanning, input-side injection defence, a real PII scan, a named breakage threshold

Closes or narrows findings A3, A4, A5, A6, B1 and the SH1/SH3/SH8/SH9/SH10 items in
`docs/STAKEHOLDERS.md` §4. Statuses are tabulated there. This entry records the
reasoning, and in three places records a decision NOT to do the obvious thing.

### The allowlist that expired without expiring (A6)

Twelve dependency-audit exceptions in `scripts/audit-gate.mjs` each carried the string
`review 2026-08`. The review window arrived. Nothing happened, because no code read that
string: it was prose inside a reason field. This is the specific failure mode worth
naming, because it is not carelessness. Someone wrote a review date **and** believed the
system would surface it, and the system had no idea the date existed.

The fix is a machine-readable `expires` date the gate enforces, plus a ceiling on how far
out an expiry may be set (180 days), so an entry cannot be parked out of sight. Renewing
requires stating a new date **and** a new reason, so a re-triage cannot be performed by
bumping a number.

Then the actual re-triage, which turned out to retire all twelve:

- **Eight `next` advisories.** No longer reported by `npm audit` at all. They were fixed
  upstream in the 15.5.x backport line that was already installed (`next@15.5.22`). The
  allowlist had been suppressing advisories that no longer existed, which is its own kind
  of hazard: it makes the list look load-bearing when it is inert.
- **Three `postcss` advisories.** Fixed in postcss 8.5.18+. `next` pins `postcss@8.4.31`
  exactly, which is why they had been written off as "no stable next fix". A `package.json`
  `overrides` entry pulls 8.5.25 through it. That option was available the whole time.
- **One `sharp` advisory** (the libvips CVEs). Fixed in sharp 0.35.0+; `next`'s optional
  dependency floats at `^0.34.3`, so the same `overrides` mechanism applies (0.35.3).

`npm audit --omit=dev` now reports zero vulnerabilities at any severity, and `npm audit`
including dev is also clean after an `npm audit fix` for `brace-expansion` and `fast-uri`.
The allowlist is empty, so the gate is load-bearing on its own: the next high or critical
advisory fails the build with nothing suppressing it.

**Correction, 2026-08-02: that "zero" was true of one third of the repository.** Both
sentences above describe `npm audit` run in the repository root, which is where the gate ran
it. There are three `package-lock.json` files here. While the paragraph above said zero,
GitHub's security tab reported **two high advisories**, both `sharp` GHSA-f88m-g3jw-g9cj, in
`sandbox/studio` and `sandbox/spike/cf-sandbox`. Neither number was wrong. The gate was
reading one lockfile and printing a verdict on the repository.

That is a nastier failure than the expired-allowlist one it replaced, because it produces
confidence rather than merely failing to remove it, and the two numbers cannot be reconciled
by a reader who does not already know the gate's scope. Three changes:

- `scripts/audit-gate.mjs` now iterates a `TREES` list covering all three lockfiles, and
  prints a per-tree line on every run, pass or fail, so the scope of the verdict is never
  left to assumption. A tree whose audit produces no JSON exits 1 rather than counting as
  clean.
- `tests/unit/audit-gate-trees.test.ts` walks the working tree for `package-lock.json` files
  and fails if any is absent from `TREES`. Verified by deleting a tree from the list and
  watching two assertions go red. The expiry test stops an exception from rotting; this one
  stops the scope from rotting, which is the same failure one level up.
- The gate now also runs each tree **with** dev dependencies, purely to report, and prints
  any high or critical advisory that is dev-only. It does not gate on them.

**The two sandbox highs are dev-only, and stay open on purpose.** `sharp` arrives in both
sandbox trees through `miniflare`, the local Workers emulator inside `wrangler`, as a dev
dependency. It is not in the deployed worker. A libvips CVE reachable only from the local
emulator is a fact about a laptop, not about anything a user loads, so it does not block a
merge. What changed is that this is now a stated policy printed on every gate run rather
than an accident of where `npm audit` happened to be invoked. Dependabot will keep counting
two, the gate will keep gating zero, and the run output now explains the gap in place.

**The decision not to take the easy path.** The allowlist could have been renewed to
`2027-02` in about a minute, with a true-sounding reason ("still no upstream fix"). It
would have been false for all twelve. The reason a dated allowlist is dangerous is
precisely that renewing it is cheaper than checking it.

**The expiry rule is unit-tested even though the allowlist is empty**
(`tests/unit/audit-gate-expiry.test.ts`), including a case built from the exact shape the
twelve real entries had. Without that test the enforcement would be dead code the day it
shipped, and would rot before the next exception needed it.

### Secret scanning blocks the deploy; SAST deliberately does not (A5)

gitleaks runs in `ci.yml`, over the **full history** (`fetch-depth: 0`), not the working
tree. A credential that was committed and then deleted is still a credential, because the
object stays in every clone; a working-tree scan would have called that clean. Because
`deploy.yml` gates on the CI workflow as a whole, a leak blocks production.

Two findings turned up in history and both are the same reviewed false positive: the
prose "API-first, risk/compliance" in a seeded job posting, which the generic-api-key rule
reads as a key assignment. The allowlist entry is that exact phrase rather than the
`seed/roles/**` directory, so a real key pasted into a seed file still fails.

`scripts/verify-secret-scan.sh` plants a canary and asserts gitleaks exits non-zero. A
scanner nobody has watched fail is indistinguishable from no scanner: a bad config, a path
filter, or a swallowed exit code all look exactly like "clean".

**CodeQL is in its own workflow and does NOT block deploys, on purpose.** It has never run
against this repository, so its first findings are untriaged by definition. Wiring an
untriaged scanner into the deploy gate has two outcomes and both are bad: production is
blocked on a finding nobody has read, or everyone learns to bypass the gate. The honest
sequence is run, triage, then promote to blocking, and the condition for closing it is
written into `codeql.yml` rather than left as an intention.

### The injection defence is containment, not a filter (A3 / SH1)

`lib/untrusted.ts` does four things: strips characters that exist only to hide text from a
human reader (zero-width, bidi overrides, the Unicode tag block), defangs anything shaped
like a prompt or envelope boundary, wraps the document in a delimited block with an
unguessable per-call boundary id and an explicit "this is data, not instructions" header,
and deterministically screens for known injection shapes.

**It does not delete the payload, and that is the design, not a shortcut.** A real CV can
legitimately contain the word "ignore", and a scan that deletes matched lines silently
corrupts someone's career history. That is a worse failure than the one being defended
against, and it is invisible to the person it happens to. So the screen FLAGS, and the
flag travels to the quality gate, which will not grade a draft built on flagged input as
`strong`.

**Applied centrally in `agent/skills/run.ts`**, not in each prompt builder. `attemptSkill`
is the one path every skill takes, so a new skill that reads `data.profile` is protected
the day it is written, without its author knowing this defence exists. A per-builder call
would have been one forgotten grep away from a hole.

**The ground truth is enveloped inside the quality gate**, not by the caller, so the
gate's `groundingChars` signal still measures the real profile slice rather than the
slice plus a 700-character envelope header. Enveloping in the wrong place would have
silently inflated every confidence score.

**What this does not do, kept in the docs and in the test:** it is guidance to a model,
not a sandbox. A novel payload passes the screen. The residual gap pinned in
`tests/unit/injection-guard.test.ts` (retrieval surfacing the injected line as admissible
evidence, and the judge crediting it) is untouched by any of this and is still pinned.

### The PII scan: implemented rather than made to fail closed (A4 / SH9)

The brief allowed either. Implementing it was chosen, and the reason the stub existed in
the first place is the reason it looked hard: RoleOS's whole job is writing a document
ABOUT a person from that person's own CV, so a résumé legitimately carries its owner's
email and phone. A scan that failed on those would fail on every correct output, and a
gate that fails on everything is switched off within a week.

So the scan asks the question that actually matters, which is not "is there PII here" but
"is this PII the candidate's own":

- Personal data traceable to the ground-truth profile: **expected**, passes.
- Personal data that is not: **third party**, fails the guardrails. A referee's number, an
  interviewer's address, contact details hallucinated from somewhere else.
- Payment cards (Luhn-checked), national identifiers, bank accounts: **never emitted**,
  fails regardless of the ground truth, including when the candidate pasted it themselves.
  Repeating one back only multiplies the places it exists.
- No ground truth to compare against: **indeterminate**. Not a failure, and explicitly not
  a pass.

That last case is the one that was actually dangerous. The old code's comment said the
scan was "stubbed honestly, not faked as passing", and then returned `ok: true` into a
field `computeConfidence` reads as a satisfied hard gate. Honesty in a comment does not
survive being wired to a boolean that means "checked". `indeterminate` now caps confidence
below `strong`, so an unevaluated control can never be mistaken for a satisfied one.

`indeterminate` deliberately does not hard-fail the gate: that would block every
ungrounded skill, which is most of them, for no security benefit. The invariant being
protected is about the CLAIM, not the output.

### The number that means "it is broken" (SH3)

Observability was not the gap. `agent_runs` recorded every gate verdict and `/admin`
rendered a pass rate. What was missing was a threshold: no value of any signal was defined
as "RO is broken right now", so detection depended on someone looking.

`lib/quality-health.ts` names it: over a rolling 60 minutes, with at least 20 user-facing
runs, a `needs_your_eyes` rate at or above 25%, or an `unknown`-confidence rate at or above
35%. The signal is the gate's own verdict about itself, which is the right choice because
a bad prompt moves it immediately without anyone reading a single draft. The
unknown-confidence rate is tracked separately on purpose: a prompt change can keep the
status passing while collapsing how much RO can vouch for, and that is still RO getting
worse.

The 20-run floor matters as much as the rates. Three bad draws out of five is noise, and
paging on noise trains people to ignore the page.

**The notification step is not built, and the module says so in those words.** The check
emits a structured `quality_health.breached` line to Workers Logs and stops. There is no
alert destination, no rotation, no escalation policy. Attaching a Workers Logs alert to
that event name is a console step that has not been done. Writing a module that implied
someone gets woken up would have been worse than the gap.

### The rollback runbook, and what it admits (SH8)

`docs/runbooks/rollback.md` is written for the specific scenario: a prompt or model change
is live, the gates are producing wrong output, nothing has thrown, and "is the site up" is
the wrong question. It gives a four-step ladder ordered by blast radius (registry revert,
prompt commit revert, whole-worker Cloudflare rollback, stand down the cron), with
estimated durations, an explicit "what you cannot roll back" section (artifacts already
generated, anything a user already sent, embeddings), and a mandatory step turning the
incident into a permanent eval case with the specific file for each failure class.

Every timing in it is an estimate derived from the deploy pipeline, not a measured
recovery, and it says so at the top. It has never been executed. Its own §6 lists the
gaps: no page, never rehearsed, single operator, no user-facing correction path.

### The eval SLA that measured the wrong thing (B1)

`capture.ts` could not be run: it needs live Supabase and Workers AI credentials, which do
not exist in this environment. So the second option was taken, and taken thoroughly.

Nothing was deleted. The lexical eval genuinely scores the query construction, the
multi-query union, and the real 689-role corpus, all shared with production. What changed
is every place that claimed more than that: the describe blocks and assertion names in
`tests/unit/retrieval-live.test.ts`, the header of `run.ts`, the PASS line the runner
prints, and the section in `docs/EVALS.md` that used to be headed "Matching-quality SLA".
Each now states what the gate catches (query construction, the union merge, corpus
integrity, the labels) and what it cannot (embedding model, re-embed correctness, pgvector
index health, distance metric, thresholds).

Two things make the gap hard to lose track of. `runSemanticEval()` scores and gates
`dataset.semantic.json` at the same floors the moment that file is committed, so nobody
has to remember to wire it up. And the absence of that file is an **assertion** in the test
suite rather than a comment, so it cannot quietly stop being true in either direction.

### What was deliberately not done

- **The remaining findings stay open.** A7 (error detail on the public SSE path), A8 (rate
  limiter failing open on `onboard`), B2 through B6, C1 through C9. This pass was scoped to
  security and to the claims that were false, and taking on the UX findings in the same
  change would have produced a diff nobody could review.
- **No lawful-basis statement, no terms, no DPIA.** Unchanged from the previous entry.
  Still a legal exercise, still absent, still said plainly rather than invented.
- **CodeQL findings are not triaged.** The workflow runs; nobody has read the output,
  because it has not run yet.
- **The shipped retriever is still not measured.** Corrected claims are not a measurement.

## 2026-08-02 · Privacy foundations: a notice, a delete path, an enforced retention window

Closes the engineering half of findings A1 and A2 in `docs/STAKEHOLDERS.md` §4. The
per-item status and what remains open are tabulated there; this entry records why the
shape is what it is.

### The framing decision, taken first

**The notice describes behaviour. It does not claim compliance.** Nik is not a lawyer, no
data protection adviser has been engaged, and a confident "RoleOS is GDPR compliant" would
be a false statement about a product that holds strangers' CVs. So `docs/PRIVACY.md` opens
by saying no external review has taken place, says explicitly that no lawful-basis
statement exists because writing one properly is a legal exercise that has not happened,
and describes what the code does table by table. An accurate inventory from a solo builder
is worth something. A compliance claim from one would be worth less than nothing.

The same rule was applied to the product copy. Where the notice would have had to describe
something aspirational, the feature was built instead or the sentence was dropped.

### The promise at `/start` was inaccurate, and the copy was changed rather than the code

"Nothing is stored unless you choose to save" was checked against the code before a word of
the notice was written. The account-data half is true: `/api/onboard` writes no
`master_profile`, `matches`, or `artifacts` row, and `lib/parse-document.ts` parses the
file in the browser so the document itself never transits the server. The blanket half is
false. Every anonymous run writes a `rate_events` row keyed by the caller's IP, and one
`agent_runs` cost row per model call, and the profile text goes to Anthropic (and to the
scraper, if a key is configured).

**Decision: fix the sentence, not the behaviour.** The IP-keyed rate limit is the only
thing standing between an anonymous Opus-class pipeline and anyone who wants to spend the
budget; removing it to make a marketing line true would be a bad trade. The copy now says
the file is read in the browser, that nothing is saved to an account until save, and that
the text does reach our server and Anthropic. The narrower claim survives because it is
true; the blanket one is gone.

### Why deletion runs with the service role

`db/migrations/0002_rls.sql` grants owners select, insert and update, and no DELETE. On
`decision_events` it grants no delete or update at all, on purpose, so the behaviour log
stays append-only. A browser client therefore cannot erase its own rows, which is why no
delete control could have been bolted onto the settings page as a client-side call. The
route authenticates from the session cookie, then deletes with the service role filtered
`.eq(user_id, thatId)` on every statement. There is no user-id parameter on the route, so
the widened privilege never widens *whose* rows are reachable.

The auth record is deleted too, so the email address goes with the data. It is done after
the explicit table sweep rather than relying on ON DELETE CASCADE alone, so the response
can report exactly what was removed and a partial failure surfaces as a partial failure
instead of a green tick.

### Why retention is enforced from a constant, not written in prose

The failure this repo already recorded once is a retention window that existed only in a
spec. So the windows live in `lib/retention.ts`; the nightly purge deletes from
`purgePlan()`; and `/privacy` renders the same array. Changing a number changes the notice
and the job in the same commit. `tests/unit/retention.test.ts` asserts the job is actually
wired to a schedule, because an unenforced window is exactly the thing that looks fine in
review.

**Deliberate asymmetry: the operational rows are time-boxed and the authored rows are
not.** IP counters, read notifications and cost telemetry age out. The CV, the drafts, the
tracker and the decision log stay for as long as the account does. Deleting someone's
half-finished job hunt on a 12-month timer would be a privacy theatre that costs the user
something real. The control offered instead is an immediate, complete delete button, and
the notice states the asymmetry in those words rather than quoting a window it does not
apply.

### What was deliberately not done

- **No terms of service, no DPIA, no lawful-basis statement, no transfer analysis.** All
  four need someone qualified. Inventing them here would recreate the exact problem this
  work exists to fix.
- **No backup scrubbing.** Supabase point-in-time recovery holds a copy until it rolls
  off. There is no application-code path to it and no manual procedure was invented to
  imply otherwise. The notice says this plainly.
- **No export ("download my data") path.** It is the natural companion to deletion and it
  is not built. It was not claimed either.
- **No consent banner and no cookie notice.** The app sets an auth session cookie and
  nothing analytical. A banner that consents to nothing would be noise.
- **`agent_runs` was not made deletable.** The FK is ON DELETE SET NULL, the rows hold
  counts and money and never prompt text, and an unattributed billing record is worth
  keeping. It is listed as a residual instead of quietly reclassified as not personal data.

### The honesty mechanism, because good intentions decay

Three places could have drifted apart and now cannot: the settings screen imports
`NOT_COVERED_BY_DELETE` from the module the route deletes from, the privacy page imports
`RETENTION_RULES` from the module the purge job reads, and
`tests/invariants/delete-coverage.test.ts` fails CI if a migration adds a table that
references `auth.users` and nobody decides whether deletion covers it. The alternative was
a document that is true on the day it is written.

---

## 2026-08-02 · Simulated adversarial stakeholder reviews

Three reviews run in character against commit `df54881` on `main`: security and data
protection, staff engineer architecture, and senior product design. Findings, ranks, and
the fix-owning file for each are tabulated in `docs/STAKEHOLDERS.md` §4.

**These reviews were simulated.** One person role-playing senior reviewers against his own
code. No external party reviewed or approved anything. The honesty note at the top of
`docs/STAKEHOLDERS.md` is the governing statement; this entry does not soften it.

### Assumptions made during the reviews

1. **Source is the only evidence.** Nothing was run against production, the Supabase
   project, or `ro.roleos.fyi`. Every claim traces to a file and line at `df54881`. Where
   a runtime behaviour is asserted (for example that Chrome gates `webkitSpeechRecognition`
   on the `microphone` permissions-policy feature, finding C6), that is a documented
   platform behaviour and not something this review observed in the deployed app.
2. **The waitlist is real.** `docs/PRD.md:4` states early access with no external active
   users. Every P0 rank assumes that stays true until the items in `docs/STAKEHOLDERS.md`
   §3 are addressed. If a candidate outside the waitlist uploads a CV tomorrow, A1 and A2
   are not P0, they are already breached.
3. **CI green means deployable.** `.github/workflows/deploy.yml` gates production on the
   whole CI workflow via `workflow_run`. The reviews therefore treated "what CI verifies"
   as "what production is guaranteed", which is what turned findings B1, B4 and C3 from
   test-coverage observations into deploy-gate observations.
4. **`agent_runs` is inside the data-protection perimeter.** It stores per-skill model
   call records. Nothing was found that writes prompt content there, but the retention
   question in A2 was ranked assuming it may contain derived personal data.

### Decisions these reviews changed

**None yet, and that is the deliberate outcome.** No code was changed. See the scope cut
below.

What the reviews changed is the record: nineteen findings that previously existed only as
unexamined assumptions now have a rank, a citing line, and a named file that would fix
them. Six approvals that nobody had ever listed as required are now listed as required and
recorded as not obtained.

### Decisions these reviews defended

- **The three-layer no-send invariant stands unchanged, and it survived being attacked.**
  The security review specifically tried to find a path around it. `agent/tools/index.ts:47-54`
  fixes the allowlist, `tests/invariants/no-send-tool.test.ts` asserts no send-capable tool,
  `.dependency-cruiser.cjs` bans outbound transport imports under `agent/` (verified green
  over 61 modules and 112 dependencies), and `app/api/dispatch/route.ts:19-24` is a real
  501 rather than a disabled feature flag. The one genuine outbound tap,
  `lib/conduit/reporter.ts`, is correctly placed under `lib/` so the import ban still
  holds, and `docs/ARCHITECTURE.md` §6 explains exactly that placement. This is the
  strongest thing in the repository and no finding weakened it.

- **The RLS coverage invariant stands, and it is now load-bearing in a new way.**
  `tests/invariants/rls-coverage.test.ts` runs inside `npm test`, which runs in the `check`
  job, which now gates deploy. A migration that adds a user-owned table without row-level
  security cannot reach production. Of all the guards in this repo, this is the one that
  most directly protects candidate data.

- **The dated CVE allowlist stands as the right shape.** `scripts/audit-gate.mjs` allowlists
  by GHSA id with a per-entry reason and an owner review date, and still fails on any new
  high or critical advisory. That is meaningfully better than raising `--audit-level` or
  suppressing wholesale. Finding A6 is about the review dates having lapsed
  (all twelve say "review 2026-08"; today is 2026-08-02) and about the gate having no date
  logic to notice. The design is defended; the expiry mechanism is missing.

- **`agent/retry.ts` stands as the best-engineered file in the repo.** Full-jitter backoff
  with the thundering-herd reasoning written down (`:158-165`), an explicit
  `NEVER_RETRY_STATUS` for 400 and 401 with the actual reason stated (`:19-27`), a
  `Retry-After` cap at 20s justified from the user's point of view (`:35`), a whole-call
  deadline shared across tool-loop turns rather than compounding per turn (`:257-266`), and
  the SDK's own retries explicitly zeroed at `agent/registry.ts:198` rather than silently
  inherited. The accompanying metered-error work (`MeteredProviderError` at
  `agent/registry.ts:116`, `MeteredRunsError` at `:138`) closed an accounting hole that the
  retry feature itself would have widened, before shipping the feature. Finding B5 is about
  what the ladder does not reach (embeddings, Supabase, the scraper) and about its budgets
  outrunning `maxDuration = 60` at `app/api/onboard/route.ts:14`. The machinery is
  defended; its perimeter is not.

- **The deploy gate's mechanism is defended.** Using `workflow_run` rather than `needs:`
  is correct (`needs:` only orders jobs inside one workflow file), and checking out
  `github.event.workflow_run.head_sha` rather than the branch tip is the detail most
  implementations get wrong. The comment block in `.github/workflows/deploy.yml` explains
  both. What the reviews question is not the gate, it is what the gate is gating on:
  see B1, B4 and C3.

- **The emotional posture is defended, and specifically.** This product handles rejection
  and someone's livelihood, and the design review was asked to probe what it feels like on
  a bad day. It holds up better than expected, for concrete reasons.
  `components/ReflectionClient.tsx:65-66` opens the post-rejection flow with "one tap helps
  me learn" and immediately says "Totally optional, skip it and nothing changes"; the skip
  button at `:101-106` is a visual peer of the save button, not a grey link beneath it. The
  save-failure copy at `:41` says it is "fine to skip; it won't hold anything up".
  `tests/invariants/wellbeing.test.ts` makes engagement-bait notifications structurally
  impossible rather than discouraged. The weak-shortlist copy at
  `app/(app)/start/page.tsx:847-849` refuses to pad the list and says so out loud.
  `agent/quality-gate.ts:140-148` bans "everything happens for a reason", "act now",
  "don't fall behind" and "you haven't logged in" by regex, before any model is consulted.
  That is a coherent, deliberate stance in a category that mostly does the opposite, and it
  is worth protecting when a future growth-shaped pressure arrives.

  The one thing that cuts against it is finding C8, the sharpness meter at
  `app/(app)/start/page.tsx:505-508`. It grades how many sources were supplied, but it sits
  beside the box where someone just pasted their career, and "sharpness 1 of 4" reads as a
  verdict on the material. The material is them. The fix is not removal, it is relabelling
  to what it actually counts.

### Scope cuts

- **No code was changed.** The reviews produced findings and artifacts only. Two reasons.
  First, fixes authored in the same pass that found the problems get no second pair of
  eyes, which is the entire failure mode these reviews exist to counter. Second, the repo
  now gates production deploys on a green CI run, so a speculative fix carries deployment
  risk that a document does not. Every finding is recorded OPEN with the file that would
  close it. Nothing was quietly fixed and then claimed as a win.

- **No live-system inspection.** No production database read, no Supabase dashboard, no
  Cloudflare account or token scope review, no headers fetched from `ro.roleos.fyi`, no
  browser session against the deployed app, no traffic analysis. That is a real limit on
  the security review in particular: RLS policy shape was read from
  `docs/security-audit.md` and from the invariant test, not verified live today.

- **No performance work.** No bundle analysis, no Workers CPU-time measurement, no
  profiling. Finding B5's budget arithmetic is read from constants, not measured.

- **No contrast or dark-mode audit.** The design review did not check rendered contrast
  ratios against `docs/specs/design-system.md`, and took no screenshots.

### Kill criteria

**There are none, and none are invented here.**

Nothing in `docs/PRD.md`, `docs/EVALS.md`, or `docs/AUDIT-LOG.md` states a condition under
which RoleOS should be stopped rather than iterated. `docs/PRD.md:66-76` names quality
metrics and a north star ("offers landed per activated candidate") but no floor and no
date. Putting a number here would be worse than the absence, because an invented threshold
looks like a decision somebody made.

What a real kill criterion would have to be, so that one can be written when there is
evidence to write it from:

- **A metric that already exists and is already collected.** Cost per journey is the only
  candidate today (`agent/registry.ts` writes every call to `agent_runs`, and
  `lib/cost-budget.ts` compares rolling spend to a daily budget). Match quality has a
  harness but no production series. Everything user-facing has no data at all, because
  there are no external users.
- **A threshold set before the measurement, not after.** A number chosen once results are
  in is a rationalisation.
- **A date.** "If X is still below Y on date Z" is a criterion. "If X stays low" is a mood.
- **A named consequence that is not 'try harder'.** Stop, narrow to one gate, or hand the
  corpus to something else. If every branch is "keep going", it is not a kill criterion.
- **An owner who is allowed to call it.** On a solo project that is the same person who
  built it, which is exactly why it has to be written down in advance.

The honest position: RoleOS cannot have a meaningful kill criterion until it has users,
because five of its six candidate metrics require them. The one that does not, cost per
journey, is already instrumented and could carry a real threshold today. That is the one to
write first.

### What each review did NOT look at

- **Security, privacy and data protection review:** did not inspect any running system.
  No production database, no Supabase dashboard or policy set as deployed, no Cloudflare
  account or API token scopes, no headers fetched from `ro.roleos.fyi`, and no traffic.
  RLS was read from `docs/security-audit.md` and `tests/invariants/rls-coverage.test.ts`,
  not verified live.
- **Staff engineer architecture review:** did not read `ingest/` (the durable Cloudflare
  Workflow), `cron/`, `sandbox/`, the SQL in `db/migrations/`, `lib/conduit/`, or the 44
  files under `components/`. No profiling, no bundle analysis, no Workers CPU-time
  measurement.
- **Senior product designer review:** did not open the live site at `ro.roleos.fyi`, did
  not test with a real user, did not check rendered contrast ratios or dark mode against
  `docs/specs/design-system.md`, did not review the marketing surface, and took no
  screenshots. Every claim is read from source.

### Verification

`npm run typecheck`, `npm run lint`, `npm run invariant:imports`, `npm test`, and
`node scripts/audit-gate.mjs` were all run and all passed at `df54881` before and after
this entry was written. 532 tests across 90 files; depcruise clean over 61 modules; audit
gate clean with 12 documented exceptions. Documentation-only change, so the build is
unaffected by design, and it was checked rather than assumed.

Incidental observation from that run, recorded as finding B6: the test count is stated as
503 in `README.md:13`, `README.md:87` and `docs/EVALS.md:12`, and as 532 in
`docs/ARCHITECTURE.md:236`. The actual figure is 532 across 90 files. One of the three
stale statements is a README badge.
