# Privacy at RoleOS

**Last updated: 2026-08-02.** This is the canonical version. The in-product page at
`/privacy` (`app/(public)/privacy/page.tsx`) renders the same content, and the retention
windows on both are read from `lib/retention.ts`, which is the file the purge job deletes
from. Change one, change all three.

## Read this first

RoleOS is built and run by one person, Nik Jain. **No external data protection review,
audit, or legal review has taken place.** Nothing on this page is legal advice, and
nothing here is a claim that RoleOS complies with the GDPR, the UK GDPR, the CCPA, or any
other regulation. Some of what a regulator would ask for is genuinely not in place yet.
What this page is: an accurate description of what the software actually does with your
data, written from the code, so you can decide whether that is acceptable to you.

The gaps that a review would find are recorded openly in `docs/STAKEHOLDERS.md` §4.

RoleOS is in early access with a waitlist. If you are here, you chose to be.

## Why we hold anything at all

You hand RoleOS your CV so it can compare you against open roles, write drafts in your
voice, and remember what you have already told it. That is the entire purpose. Everything
listed below exists because one of those three jobs needs it. We have not written a
lawful-basis statement, because writing one properly is a legal exercise that has not
happened. The honest version is: you gave it to us to do this work, and you can take it
back at any time from Settings.

Your data is not sold, and it is not used to advertise to you. It is not used to train
anybody's model by RoleOS. What the model providers do under their own terms is their
policy, not ours, and is linked below.

## What is stored, where, and for how long

Everything in this table lives in one hosted Postgres database (Supabase). Every row is
tagged with your user id and locked by row-level security, so one signed-in account
cannot read another's rows (`db/migrations/0002_rls.sql`).

### The things you wrote or uploaded

| What | Table | Why it exists | How long |
|---|---|---|---|
| Your CV / profile text, the LinkedIn URL you pasted, the structured profile derived from it | `master_profile` | It is what every match, draft and answer is grounded in | While your account exists |
| A numeric vector derived from that text | `profile_embeddings` | Fast role matching | While your account exists |
| RO's reasoning about you per role: fit score, why, gaps | `matches` | Your shortlist | While your account exists |
| Résumés, cover letters, screening answers, counters RO drafted | `artifacts` | Your drafts | While your account exists |
| Where you applied, the stage, your notes | `applications`, `pipeline` | The tracker | While your account exists |
| Your goal, deadline, target comp and location | `goals`, `intents` | Pace and planning | While your account exists |
| Your notes on individual roles | `role_notes` | Your notes | While your account exists |
| **People from your LinkedIn connections export or typed by hand: name, employer, title, email, your relationship note** | `connections` | Warm-intro paths | While your account exists |
| What RO has written down about you (short notes, with confidence) | `ro_memory` | So you do not repeat yourself | While your account exists |
| Recent verbatim question-and-answer turns with RO | `ro_threads` | Conversation continuity | While your account exists |
| What RO has inferred about your taste, and the evidence for it | `taste_model`, `taste_dimensions` | Ranking that improves | While your account exists |
| An append-only log of your actions: sent, skipped, edited, rejected, corrected, approved, viewed | `decision_events` | The substrate the taste model is derived from | While your account exists |
| Notification cadence, quiet hours | `profiles` | Your settings | While your account exists |
| Digests and nudges RO produced for you | `notifications` | Your feed | Read or dismissed items: **90 days**. Unread items are left alone |
| Your Google refresh token, only if you connected Google | `google_tokens` | Reading Gmail and Calendar, read-only scopes, to spot interview threads | While your account exists, or until you disconnect |

**"While your account exists" is a real statement, not a dodge.** There is no timer on
your CV or your drafts. Deleting someone's work out from under them on a schedule would
be a worse product, not a more private one. The control you have instead is the delete
button, and it is immediate.

### The operational rows, which are time-boxed and purged

These are enforced by `lib/retention.ts` and deleted nightly by
`app/api/cron/purge/route.ts`, which the cron worker calls at 02:30 UTC.

| What | Table | Why it exists | Window |
|---|---|---|---|
| Rate-limit counters, keyed by **IP address** for signed-out requests | `rate_events` | Stops one visitor burning the model budget | 7 days |
| The same counter for the public Index ask box, keyed by IP address | `index_ask_events` | Same | 7 days |
| Per-model-call cost and latency: model name, token counts, cost, latency, quality-gate verdict | `agent_runs` | Cost control and quality measurement | 180 days |

`agent_runs` deserves a specific statement because it is the row most likely to be assumed
guilty: **it does not store prompt text or model output.** The write path is
`lib/agent-runs.ts`; the columns are counts, money and a verdict.

### Your account itself

Your email address, and the identity from whichever provider you signed in with (magic
link, Google, LinkedIn, or GitHub), are held by Supabase Auth. RoleOS never sees or stores
a password, because it never asks for one.

### What is in logs

Application logs are structured JSON lines on Cloudflare's platform
(`lib/log.ts`). Field values whose key looks like a secret are redacted. Route handlers log
events, counts, and error messages. No route logs CV text or profile content. Cloudflare's
own request logs contain IP addresses under Cloudflare's retention, not ours.

## Before you sign up

The onboarding run at `/start` is deliberately different, and this is the part the product
copy used to overstate.

**True:** your CV file never leaves your browser. PDF and text extraction runs client-side
(`lib/parse-document.ts`), so only the extracted text is sent. Nothing you type or paste is
written to any RoleOS table until you press save, which requires signing in. Onboarding
results are held in your browser's `sessionStorage` until then.

**Also true, and previously unsaid:** the extracted text is sent to our server so RO can
work on it, and from there to Anthropic's API. If you pasted a LinkedIn URL and the
optional scraper is switched on, that URL goes to the scraping provider. A rate-limit row
containing your IP address is written on every onboarding run, before any of that. So
"nothing is stored" was not accurate, and the copy at `/start` has been changed to say
what actually happens. The stronger claim, that nothing about you is saved *to your
account* until you choose to save, is true and still stands.

## Who else your data reaches

| Who | What they get | When |
|---|---|---|
| **Anthropic** | Your profile text and role descriptions, inside prompts, for matching, drafting and answering | Every RO run, including anonymous onboarding |
| **Cloudflare** | Hosts the app; sees requests and IP addresses. Workers AI computes the profile embedding, so the profile text passes through it | Always |
| **Supabase** | Hosts the database and authentication. Everything in the tables above sits here | Always |
| **Apify or Bright Data** | The LinkedIn profile URL you pasted, in order to fetch that public profile | Only if a scraper key is configured. **Off by default**, and off unless the key is set (`lib/profile-fetcher.ts`) |
| **GitHub** | Your GitHub username, via the public API, if you supplied a GitHub URL | Only when you supply one |
| **Google** | Read-only Gmail and Calendar access, if you connect it. RO reads to spot interview threads. It has no send capability, by construction | Only if you connect Google |

RoleOS cannot send email or messages on your behalf. There is no send tool in the agent
layer, and CI enforces that (`tests/invariants/no-send-tool.test.ts`,
`.dependency-cruiser.cjs`). Drafts are drafts until you act on them yourself.

Each of these providers holds data under their own terms and their own retention. Deleting
your RoleOS data does not reach into them.

## Deleting your data

**Settings → Your data → Delete everything.** You type DELETE to confirm. It runs
immediately; there is no grace period and no undo.

It deletes, in one pass: `master_profile`, `profile_embeddings`, `matches`, `artifacts`,
`applications`, `pipeline`, `goals`, `intents`, `role_notes`, `connections`, `ro_memory`,
`ro_threads`, `taste_model`, `taste_dimensions`, `decision_events`, `notifications`,
`google_tokens`, `profiles`. Then it deletes your Supabase Auth record, which removes your
email address and your ability to sign back in to that account.

The exact list is `USER_DATA_TABLES` in `lib/account-delete.ts`, and it is pinned by a
test so a new table cannot be added without a decision about deletion.

### What deletion does not cover

This is the honest part, and it is the same list the settings screen shows you.

- **`agent_runs`.** The cost and latency row for each model call survives, with its
  `user_id` set to NULL, as an unattributed billing record. It never contained your CV
  text.
- **`rate_events` and `index_ask_events`.** Abuse counters keyed by IP address rather than
  by user id, so application code cannot match them back to your account to delete them.
  They age out on the 7-day window above.
- **Third parties.** Anthropic, Supabase, Cloudflare, and the scraper if it was on, hold
  their own copies under their own retention. The delete button reaches the RoleOS
  database only.
- **Backups.** Supabase's point-in-time recovery holds a copy until it rolls off. That is
  not reachable from application code, and no manual backup-scrubbing procedure exists.
- **Anonymous aggregates.** `collective_resume_signals()` returns counts across all users
  by action and signal category, with no user id and no text
  (`db/migrations/0019_collective_signals.sql`). Your rows are gone from the input the
  moment you delete; counts computed before then are not individually attributable and are
  not reversed.

If you want something removed that this button cannot reach, email Nik. There is no
automated process for it and no promised turnaround.

## Data you give us about other people

`connections` holds real people who are not RoleOS users: their names, employers, titles
and sometimes their email addresses, taken from your own LinkedIn data export or typed by
you. They did not agree to this and they cannot see or delete it. RoleOS never contacts
them. They are deleted when you delete your data, and individually from the Connections
screen. If you are uncomfortable with that, do not upload the export; every other part of
the product works without it.

## Changes

This file is versioned in git. There is no notification mechanism for changes to it yet;
the commit history is the change log.

## Contact

Nik Jain, via the repository at `github.com/nikjain15/roleos-app`. There is no data
protection officer, and no formal complaints process.
