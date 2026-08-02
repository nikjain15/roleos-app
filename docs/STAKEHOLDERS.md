# Stakeholders, simulated adversarial review

## Read this first: what this document is, and what it is not

**These reviews are simulated. One person, Nik Jain, role-played three senior reviewers
against his own code. No real lawyer, no real data-protection officer, no real security
engineer, no real recruiter or employment adviser, and no real design partner read this
repository, reviewed this product, or approved anything in it.**

Nothing here is a sign-off. Nothing here is legal advice, a data-protection assessment, a
penetration test, or a professional accessibility audit. Where this document says a
finding is "P0", that is one developer's ranking of his own work, not an external verdict.

RoleOS ingests candidate CVs. A CV is personal data, and it is often the most complete
personal record a person will ever hand to a piece of software. A document implying that
someone qualified had reviewed how that data is handled would be a materially false claim
about a real product handling real people's information, so this note sits at the top
rather than in a footnote.

What a structured self-critique **is** genuinely good for: it forces the author to attack
the work in a voice that is not his own, it produces findings that are specific enough to
act on, and it names, in writing, which decisions are still owned by nobody. Framed
accurately, that is worth doing. It is not worth mistaking for review.

Reviews were run against commit `df54881` on `main`. Every finding cites a file and a line
read from source. No production system, no live database, and no deployed site was
inspected.

---

## 1. Roles that would need real involvement

Nobody in this table has been engaged. This is the map of who would need to be, what they
would need, what they would own, and what they would stop.

| Role | What they need from RoleOS | Decision they own | What they block on |
|---|---|---|---|
| **Data protection adviser / DPO** | The full data inventory: what `master_profile` holds (raw CV text, read at `agent/tools/index.ts:96-102`), what leaves for Anthropic and Cloudflare Workers AI, what `agent_runs` retains, what the Apify/Bright Data scraper path sends (`app/api/onboard/route.ts:84`). Plus the sub-processor list and the transfer basis. | Lawful basis for processing, the retention window, the sub-processor list, and whether a DPIA is required. | Ships nothing to a candidate outside the waitlist until there is a published privacy notice, a working deletion path, and a written retention period. As of 2026-08-02 all three exist in code and are described in `docs/PRIVACY.md`, and none of them has been read by anyone qualified. What is still absent is the lawful-basis statement, the terms, and the review itself. |
| **Security engineer** | The threat model for a product whose primary input is an attacker-controllable document, the RLS policy set, the secret inventory and rotation state, and CI's scanning coverage. | Whether the current injection posture is acceptable for the data at risk. As of 2026-08-02 there IS a code-level input defence (`lib/untrusted.ts`, applied centrally in `agent/skills/run.ts`) and a real PII scan (`lib/privacy-scan.ts`), and neither has been reviewed by anyone who did not write them. Whether the envelope-plus-screen posture is sufficient, and whether CodeQL should be deploy-blocking, are still their calls. | Any change that widens what an ingested document can reach. Would block on the unrotated setup secrets still listed open in `docs/security-audit.md:47-48`. |
| **Design partner (a real senior job-seeker, mid-hunt)** | Access to the live flow with their own CV, on their own phone, on a genuinely bad week. | Whether the five-gate flow is usable under stress, and whether the honesty posture reads as respect or as discouragement. Nobody but the author has an opinion on this today. | Nothing formally. In practice they block the claim that the emotional design works, which is currently an assertion by its author. |
| **Employment / recruiting adviser** | The truth gate's actual behaviour on a real tailored resume, the negotiation gate's outputs, and the screening-answer path. | Whether RO's drafted claims survive contact with an ATS, a recruiter, and a background check. Whether "truth-gated" holds up against how employers actually read a CV. Whether anything RO drafts could expose a candidate to a misrepresentation claim. | Enabling the Gate 5 negotiation surface, and any live transport behind `app/api/dispatch`. |
| **Support (whoever answers when it goes wrong)** | A runbook for "RO got my history wrong", "I want my data deleted", and "I applied with a draft that had an error in it". | The escalation path and the correction path. | Real users. There is no support surface, no contact route in the app, and no runbook. |

## 2. The single biggest misalignment risk

**The repository is unusually honest about code and silent about consent, and the contrast
makes the silence read as a clean bill of health.**

`README.md:100-108` volunteers that the dispatch route returns 501, that agent tool bodies
are placeholders, and that the PII scan is a stub. `docs/ARCHITECTURE.md:213-216` lists two
honest limitations under a heading that says so. `docs/FDE_JOURNEY.md:2` names a residual
injection gap without being asked. That habit is real and it is rare.

There is no equivalent paragraph anywhere about the legal basis for holding a stranger's
CV. There is no privacy notice, no terms, no retention period, and no deletion path
(section 3 below).

> **Update, 2026-08-02.** Three of those four now exist: `docs/PRIVACY.md` and `/privacy`,
> an enforced retention window (`lib/retention.ts` plus the nightly purge), and a working
> deletion path (`app/api/account/delete/route.ts`). The lawful basis is still absent, and
> the notice says so rather than papering over it. The paragraph above is left standing
> because the *shape* of the risk it describes is the thing to keep in view: honesty about
> code still does not imply anything was reviewed. See §4, "What changed for A1 and A2".

A reader who has just watched this codebase flag its own stubs will
reasonably conclude that anything unflagged was checked and found fine. It was not
checked. It was never considered as a category.

The risk is not that a gap exists. Early products have gaps. The risk is that the
surrounding honesty actively conceals this particular one, from readers and from the
author, right up until the first candidate outside the waitlist uploads a CV.

## 3. Sign-offs

### Approvals that would genuinely be required before candidates outside the waitlist rely on this

1. **A published privacy notice and lawful basis**, reviewed by someone qualified. Covering
   at minimum: what is stored, for how long, who processes it (Anthropic, Cloudflare,
   Supabase, and the optional Apify/Bright Data scraper), and how to get it deleted.
2. **A working deletion path**, verified end to end, including `master_profile`,
   `artifacts`, `applications`, `decision_events`, and any derived embeddings.
3. **A written retention window**, with a mechanism that enforces it rather than a
   sentence that describes it.
4. **A security review by someone who did not write the code**, focused on the document
   ingest path and the RLS policy set.
5. **An accessibility pass by someone who uses assistive technology**, not an axe run.
   `docs/security-audit.md:49-51` already calls this out as a worthwhile dedicated effort
   and it has not happened.
6. **At least one design partner** who is actually job-hunting, using the live product.

### Approvals obtained

**None. Zero. Not one of the six above has been obtained, requested, or scheduled.**

The Phase-5 audit in `docs/security-audit.md` is dated 2026-06-28 and marked green. It was
performed by the author against his own code. It is a useful self-check and it is not an
external sign-off, and it should not be cited as one.

### Plan

RoleOS is early access behind a waitlist with no external active users
(`docs/PRD.md:4`), which is why it is currently defensible to ship without any of this.
That defence expires the moment a person who is not the author uploads a CV.

The order that matters:

1. Privacy notice, retention window, and deletion path. These are prerequisites, not
   improvements, and items 1 to 3 above are cheap relative to what they de-risk.
2. ~~Secret scanning in CI, before the repo takes another contributor.~~ Done 2026-08-02: gitleaks over the full history, blocking. CodeQL runs but is not deploy-blocking until its first findings are triaged. The unrotated setup secrets in `docs/security-audit.md` are still open, and scanning does not rotate them.
3. A design partner. This one costs nothing but asking, and it is the only item on the
   list that can tell the author whether the product's central bet is right.
4. Everything else after there is a reason to believe anyone wants this.

## 4. Pushback

Findings from the three simulated reviews. Full reasoning, credits, and the "what this
review did not look at" lines are recorded in `docs/DECISION_LOG.md`.

Status is honest: **OPEN** means nothing was changed. No code was changed in response to
these reviews. That was deliberate (see the scope note in the decision log): the
deliverable was the review, and inventing fixes under the same session that found the
problems would have produced changes nobody reviewed.

| # | Rank | Finding | File that would fix it | Status |
|---|---|---|---|---|
| A1 | **P0** | No privacy notice, no terms, no statement of lawful basis anywhere in the app, while `app/(app)/start/page.tsx:513` promises "Nothing is stored unless you choose to save" and `app/api/save/route.ts` then persists the full CV. | new `app/(public)/privacy/page.tsx`, linked from `app/(app)/start/page.tsx:513` | **PARTLY CLOSED** (see below) |
| A2 | **P0** | No deletion path and no retention window. `app/(app)/settings/page.tsx` has no delete control; no purge job exists in `cron/`; grep for retention or erasure across `app lib db` hits only spec prose. | new `app/api/account/delete/route.ts` plus a `app/(app)/settings/page.tsx` control | **CLOSED as engineering, OPEN as review** (see below) |
| A3 | P1 | No code-level prompt-injection defence on the ingest path. `lib/parse-document.ts:31-36` extracts PDF text and `app/api/onboard/route.ts:99-108` concatenates it into prompts with no delimiting or provenance marking. `runGuardrails` (`agent/quality-gate.ts:161-172`) scans output only, never input. | new `lib/untrusted.ts`, applied at `app/api/onboard/route.ts:108` | **CLOSED as engineering** (2026-08-02): `lib/untrusted.ts` + central application in `agent/skills/run.ts` and the truth judge. Containment and labelling, not a filter, and the docs say so |
| A4 | P1 | The stubbed PII scan is scored as a pass. `agent/quality-gate.ts:169-171` admits the stub; `computeConfidence` (`:122`) reads `guardrailsOk` as a satisfied hard gate, so a draft leaking a third party's phone number can still score `strong`. | `agent/quality-gate.ts:140-154` (detectors) or `:122` (cap at `weak` while stubbed) | **CLOSED** (2026-08-02): `lib/privacy-scan.ts` is a real scan; `indeterminate` can never be read as a pass |
| A5 | P1 | No secret scanning and no SAST in CI. `.github/workflows/ci.yml` covers types, lint, deps, tests, and `npm audit` only. `docs/security-audit.md:47-48` still lists unrotated setup secrets as open. | `.github/workflows/ci.yml` (gitleaks + CodeQL) | **PARTLY CLOSED** (2026-08-02): gitleaks over full history is a blocking CI job; CodeQL runs but is deliberately NOT deploy-blocking until its first findings are triaged |
| A6 | P1 | The dependency allowlist review window has lapsed. All 12 entries in `scripts/audit-gate.mjs` say "review 2026-08"; today is 2026-08-02. The gate has no date logic, so entries persist silently forever. | `scripts/audit-gate.mjs` (expiry field, fail past it) | **CLOSED** (2026-08-02): expiry enforced in `scripts/audit-gate.mjs`; all 12 entries re-triaged and retired; allowlist now empty |
| A7 | P1 | Server error detail is streamed to unauthenticated clients. `app/api/onboard/route.ts:207-212` sends `detail: e.message` on the public SSE path; Supabase and Anthropic errors carry schema and request internals. | `app/api/onboard/route.ts:211` (log it, drop it from the wire) | OPEN |
| A8 | P2 | The rate limiter fails open on the most expensive public path. `lib/rate-limit.ts:73-76` allows on any storage error; `app/api/onboard/route.ts:37` is the only guard on an anonymous Opus-class pipeline with a 200,000-char input ceiling. | `lib/rate-limit.ts:73` (fail closed for `onboard`) | OPEN, deliberate |
| B1 | **P0** | The enforced matching SLA does not measure the shipped retriever. `docs/EVALS.md:59-69` gates CI on precision@10 and MRR, but `evals/retrieval/live/retriever.ts:9` is TF-IDF while production is bge over pgvector. `capture.ts` exists to close this and has never run: `dataset.semantic.json` is absent and `capture.ts` has one commit. A bge regression passes CI green, and CI now gates deploy. | run `npm run eval:retrieval:capture`, commit `evals/retrieval/live/dataset.semantic.json`, score it in `run.ts` | **PARTLY CLOSED** (2026-08-02): the false claim is corrected everywhere and the gap is asserted in a test; the shipped retriever is still not measured |
| B2 | P1 | Eval labels are LLM-generated but documented as human. `evals/retrieval/live/build-queries.ts:4-7` says relevance comes from "the human `archetype` label"; `archetype` is produced by `agent/skills/extract_role.ts:20`. The floor scores a retriever against labels written by the same model stack. | `evals/retrieval/live/build-queries.ts:4-7` and `docs/EVALS.md:59` (correct the claim), or hand-label a subset | OPEN |
| B3 | P1 | Placeholder tool bodies resolve instead of throwing. `agent/tools/index.ts:179` returns `{ todo: "phase 2" }`. `liveTools()` filters them correctly, but `tools` is exported complete, so a future direct caller gets a silent wrong answer that is valid JSON and invisible to the quality gate. | `agent/tools/index.ts:179` (throw) | OPEN |
| B4 | P1 | 29 live e2e specs never run automated. `playwright.config.ts:16` ignores `**/live/**` and CI runs only `npm run test:e2e`, so the deploy gate rests on two public pages plus a headers spec. The RLS probe, the a11y sweep, and the API contract spec all self-skip. | new scheduled workflow running `test:e2e:live` against a preview environment | OPEN |
| B5 | P1 | The retry ladder covers Anthropic only, and its budgets exceed the route ceiling. Embeddings are a `workers-ai` job that `agent/registry.ts:190-192` refuses, so the flagship matching path has no retry. Supabase and the scraper have none. `agent/retry.ts:202` gives `draft` a 240s deadline inside a route declaring `maxDuration = 60` (`app/api/onboard/route.ts:14`). | `lib/embeddings/index.ts` (extend the runner), `agent/retry.ts:200-206` (reconcile with route ceilings) | OPEN |
| B6 | P2 | Test-count drift across three docs. `README.md:13` and `:87` and `docs/EVALS.md:12` say 503; `docs/ARCHITECTURE.md:236` says 532; the actual run is 532 across 90 files. One of the three is a badge. | `README.md:13` (derive it or drop the count) | OPEN |
| C1 | **P0** | Onboarding results can be destroyed by the sign-in that saves them. `app/(app)/start/page.tsx:316-329` stashes the whole result in `sessionStorage` and redirects to magic-link sign-in. Magic links are routinely opened on another device or another browser; `sessionStorage` does not survive either. The user lands at `/feed` empty after a roughly two-minute wait, with no copy for that state. | `app/api/save/route.ts` plus `app/(app)/start/page.tsx:316` (short-lived server-side handoff token) | OPEN |
| C2 | P1 | The specified 40px tap-target bar is missed on the primary onboarding control and checked nowhere. `docs/AUDIT-DIMENSIONS.md:15` requires it; `app/(app)/start/page.tsx:716` and `:723` are `h-7 w-7` (28px), `FilterPills` at `:669` is roughly 24px tall, and `grep -rn "boundingBox" tests/` returns nothing. | `tests/e2e/helpers/` (a size assertion, called from `smoke.spec.ts` so it runs in CI) plus the three sites above | OPEN |
| C3 | P1 | Verified a11y is two public pages, not the specified sweep. `tests/e2e/live/a11y-sweep.spec.ts` covers 13 authenticated screens well and never runs; CI covers `/` and `/login`. Every signed-in surface is unverified on any given change. | `docs/AUDIT-DIMENSIONS.md:17` (state it plainly) plus the scheduled job in B4 | OPEN |
| C4 | P1 | The two-minute wait is silent to screen readers and offers no exit. The status ticker at `app/(app)/start/page.tsx:550-562` has no `aria-live`, though the repo uses it correctly in 12 other components. No cancel, no elapsed time, no estimate. | `app/(app)/start/page.tsx:551` | OPEN |
| C5 | P1 | The onboarding error state is a dead end. `app/(app)/start/page.tsx:564` renders a bare paragraph, no `role="alert"`, no retry, against D7's own bar that "every state has a way forward". `components/ReflectionClient.tsx:108-112` and `app/error.tsx` both get this right. | `app/(app)/start/page.tsx:564` | OPEN |
| C6 | P2 | A shipped feature is disabled by a shipped header. `lib/security-headers.ts:41` sets `microphone=()`; `components/VoiceMode.tsx:33` drives the coach gate through `webkitSpeechRecognition`, which Chrome gates on that feature. The honest fallback becomes the only path. `tests/e2e/live/voice-mocks.spec.ts` would catch it and never runs. | `lib/security-headers.ts:41` or `components/CoachClient.tsx:6` (pick one) | OPEN |
| C7 | P2 | No `loading.tsx` and no `not-found.tsx` anywhere in `app/`. Route transitions hold blank, and a stale artifact link (which this product generates) gets the unstyled Next.js 404, outside the design system `README.md:150` calls non-negotiable. `app/error.tsx:32` also offers only "Back to the feed", which is a login redirect for signed-out visitors. | new `app/not-found.tsx` and `app/(app)/loading.tsx` | OPEN |
| C8 | P2 | The sharpness meter grades the person, not the input. `app/(app)/start/page.tsx:505-508` renders "sharpness 1 of 4" beside the box where someone just pasted their career. It measures how many sources were supplied; it reads as a verdict on the material, and the material is them. | `app/(app)/start/page.tsx:506` (relabel to a source count) | OPEN |
| C9 | P2 | `app/(app)/start/page.tsx:100` hard-redirects anyone with saved matches away from `/start` with no message. Someone whose situation changed and who deliberately came back to start over is bounced without explanation or a pointer to `/goal`. | `app/(app)/start/page.tsx:100` | OPEN |

### What changed for A1 and A2 (2026-08-02)

The status column above no longer reads OPEN for the two P0 data-protection items. What
changed is code and a written notice. What did **not** change is the review status: no
lawyer, no DPO, and no data protection adviser has read any of it. The approvals list in
§3 is unchanged and still reads zero. These two items moved from "nothing exists" to
"something honest exists and nobody qualified has checked it", which is a real improvement
and is not the same thing as being closed.

**A1, partly closed.**

- `docs/PRIVACY.md` is the canonical notice, and `app/(public)/privacy/page.tsx` renders it
  in the product. It carries the real inventory (table by table, why each exists, how long
  it stays), the sub-processor list, what deletion does and does not reach, and an opening
  paragraph stating plainly that no external review has taken place.
- It is linked from the onboarding screen, the settings screen, and the marketing footer.
- **Still open:** no lawful-basis statement, because writing one properly is a legal
  exercise. The notice says so in those words rather than inventing one. No terms of
  service. No DPIA. No transfer-basis analysis. Item 1 of the §3 approvals list is
  untouched.

**A1's underlying copy defect is fixed, and the promise was indeed inaccurate.** The line
at `app/(app)/start/page.tsx` claimed "Nothing is stored unless you choose to save". The
account-data half of that was true: `/api/onboard` writes no profile, match, or artifact
row. The blanket half was not. Every anonymous onboarding run writes a `rate_events` row
keyed by the caller's IP address (`lib/rate-limit.ts`) and one `agent_runs` cost row per
model call, and the profile text is sent to Anthropic and, when a scraper key is set, to
Apify or Bright Data. The copy was changed rather than the behaviour, because the
behaviour is defensible and the sentence was not.

**A2, closed as engineering.**

- `app/api/account/delete/route.ts` plus `lib/account-delete.ts` delete all eighteen
  user-owned tables and then the Supabase Auth record. The user id comes from the session
  cookie and the route has no user-id parameter, so one account cannot delete another's.
  It uses the service role because RLS grants users no DELETE on most of these tables and
  `decision_events` is deliberately append-only, which is precisely why no client-side
  delete was ever possible.
- `components/DeleteMyData.tsx` is the settings control, with typed confirmation, and it
  renders `NOT_COVERED_BY_DELETE` from the same module the route deletes from, so it
  cannot claim a cleaner sweep than the code performs.
- Retention: `lib/retention.ts` holds the windows, `app/api/cron/purge/route.ts` deletes on
  them, and `cron/worker.ts` calls it nightly at 02:30 UTC. Four rules: `rate_events` and
  `index_ask_events` at 7 days (they hold IP addresses), read or dismissed `notifications`
  at 90 days, `agent_runs` at 180 days. The privacy page renders the same constants, so a
  window nothing enforces cannot appear in the notice. That was the specific failure this
  document recorded.
- Tests: `tests/unit/account-delete.test.ts` (right rows, every statement filtered to one
  user, idempotent, no silent skips), `tests/unit/retention.test.ts` (cutoff maths, the
  authored tables are deliberately not on a timer, the job is actually wired), and
  `tests/invariants/delete-coverage.test.ts` (a future migration adding a user-owned table
  fails CI unless someone decides about deletion).
- **Still open:** the CV and drafts have no time limit while the account exists, by
  decision rather than by omission. `agent_runs` cost rows survive with a NULL user id.
  IP-keyed counters are not deletable per user because they are not keyed by user. Supabase
  backups are not reachable from application code and there is no manual scrubbing
  procedure. The delete path has not been executed against the production database. Item 2
  of the §3 approvals list is unchanged: nobody has verified this end to end but its author.

### What changed for A3, A4, A5, A6 and B1 (2026-08-02, second pass)

Same caveat as the A1/A2 update above, and it is the important one: **what changed is
code. Nothing here has been reviewed by anyone who did not write it.** The approvals list
in §3 still reads zero. A security engineer has still not looked at the document ingest
path or the RLS policy set. "Closed as engineering" is not "closed".

**A6, closed.** The dependency allowlist now has enforced expiry. Each entry needs a
machine-readable `expires` date, the gate fails past it, and an expiry more than 180 days
out is itself a failure. All twelve entries were re-triaged rather than renewed, and all
twelve were retired: the eight `next` advisories were already fixed upstream in the
15.5.x line installed here and `npm audit` no longer reports them; the three `postcss`
advisories and the one `sharp` advisory have upstream fixes that `package.json`
`overrides` now pulls through `next`'s pins. `npm audit` reports zero vulnerabilities,
dev and prod. The allowlist is empty, and the expiry rule is unit-tested anyway
(`tests/unit/audit-gate-expiry.test.ts`) so it is not dead code the day it ships.

**Correction, 2026-08-02.** "`npm audit` reports zero vulnerabilities, dev and prod" was a
root-directory result stated as a repository-wide one. This repo has three lockfiles and the
gate audited one, while Dependabot reported two high `sharp` advisories in `sandbox/studio`
and `sandbox/spike/cf-sandbox`. The gate now iterates all three trees, prints a per-tree line
on every run, and separately reports dev-only high advisories so its count reconciles with
GitHub's. `tests/unit/audit-gate-trees.test.ts` fails if a new lockfile is added and not
registered. The two sandbox advisories remain open and ungated on purpose: `sharp` reaches
those trees through `miniflare` inside `wrangler`, a dev dependency of a private spike
package, and is not in the deployed worker. See `docs/DECISION_LOG.md` for the long form.

**A5, partly closed.** gitleaks scans the **full git history** on every push and pull
request, in `ci.yml`, so a leak blocks production. `scripts/verify-secret-scan.sh` plants
a canary and asserts the scanner fires, because a scanner nobody has seen fail is
indistinguishable from no scanner. Two history findings were reviewed and are the same
false positive (job-posting prose reading as a key assignment); the allowlist entry is
that exact phrase, not the directory. **Still open:** CodeQL runs in its own workflow and
is deliberately NOT deploy-blocking, because its first findings are untriaged by
definition; and this does nothing about the unrotated setup secrets still listed in
`docs/security-audit.md:47-48`, which is a human action.

**A3, closed as engineering.** `lib/untrusted.ts` wraps candidate-supplied document text
in a delimited, labelled untrusted-data envelope with an unguessable per-call boundary id,
strips invisible-character smuggling (zero-width, bidi overrides, the Unicode tag block),
defangs boundary-shaped tokens, and screens for known injection shapes. It is applied
centrally in `agent/skills/run.ts`, so a new skill is covered the day it is written, and
in the quality gate before the truth judge reads the master profile. The ingest route
sanitises before persisting. **Still open, and stated in the module itself:** this is
containment and labelling, not filtering. It does not delete the payload, because
deleting matched lines from a real CV silently corrupts someone's career history. A novel
payload passes the screen. The residual gap pinned in `tests/unit/injection-guard.test.ts`
is unchanged and still pinned.

**A4, closed.** The privacy scan is real (`lib/privacy-scan.ts`). It classifies each hit
against the ground-truth profile: the candidate's own contact details pass, third-party
personal data fails the guardrails, and payment cards, national identifiers and bank
accounts fail regardless. Where it cannot classify (no ground truth) it returns
`indeterminate`, which caps confidence below `strong`. That last part is the actual fix
for the finding: the danger was never the missing detectors, it was a stub returning a
boolean that `computeConfidence` read as a satisfied hard gate.

**B1, partly closed and honestly so.** `capture.ts` still has not been run, because it
needs live credentials. What changed is that nothing claims to gate the shipped retriever
any more: the test names, the runner's output, and the `docs/EVALS.md` section that was
headed "Matching-quality SLA" now all state what the lexical baseline catches and what it
cannot. `runSemanticEval()` will score and gate `dataset.semantic.json` at the same floors
the moment it is committed, and the absence of that file is asserted in the test suite
rather than described in a comment. **Still open:** a bge regression can still reach
production without any gate noticing.

**SH8 and SH3, new.** `docs/runbooks/rollback.md` is a RoleOS-specific rollback runbook
for the "gates are producing wrong output" scenario, with a blast-radius-ordered ladder,
what cannot be rolled back, and a mandatory step turning the incident into a permanent
eval case. `lib/quality-health.ts` names the number that means broken. **Still open, and
this is the biggest one:** nothing pages anyone. The threshold emits a structured log line
into Workers Logs with no alert attached, no rotation, and no escalation policy. In
practice the first report of a bad prompt will come from a person. The runbook's own §6
lists that and four other gaps rather than leaving them to be discovered mid-incident.

### Where Nik would defend the design

These are findings the reviews raised and the author is not conceding. They are recorded
so the disagreement is visible rather than quietly dropped.

- **A8, the rate limiter failing open.** `lib/rate-limit.ts:14-17` states the reason: a
  limiter outage must not take the product down. That is the right default for five of the
  six scopes. The pushback is narrower than the finding, and it is accepted only for
  `onboard`, which is anonymous and Opus-class. The general principle stands.

- **B3, placeholder tools resolving.** The counter-argument is that `liveTools()` is the
  only supported accessor and it filters correctly, and that a `throw` in a placeholder is
  guarding against a caller that does not exist. That is true today. It is still a
  one-word change that converts a future silent-wrong into a loud-wrong, and the cost of
  being wrong here is a fabricated answer that the quality gate cannot see, because
  `{"todo":"phase 2"}` is well-formed. Defended as low priority, conceded as correct.

- **C1's underlying trade, not the finding.** The reason the result lives in
  `sessionStorage` at all is the privacy promise at `app/(app)/start/page.tsx:513`:
  nothing persists before the user chooses to save. That promise is real and it is worth
  keeping. What is not defensible is that the trade was never written down: the product
  chose privacy and paid for it in data loss at the highest-intent moment, and nobody
  decided that consciously. The fix must preserve the promise, not abandon it.

- **The honesty posture generally.** Several findings above exist only because the code
  and docs volunteer their own gaps. `README.md:100-108`, `docs/ARCHITECTURE.md:213-216`,
  `docs/EVALS.md:35`, and the comment at `agent/quality-gate.ts:169-171` all name stubs
  that a less careful repo would leave for a reviewer to discover. That habit made these
  reviews faster and it should not be traded away for a cleaner-looking document.
