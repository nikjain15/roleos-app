# X6 — Referral & warm-intro finder (PRD — HARD-STOP: needs your data-source approval)

> **Status: SPEC ONLY.** The board flags X6 "human approval (ToS/data source); spec first."
> This PRD lays out the options and the guardrails; NO code ships until you pick a source
> model below. The slice hard-stops here by design.

## Problem

A referral multiplies screen odds several-fold, yet users apply cold even when a warm path
exists — they don't systematically ask "who do I know at/near this company?", and drafting the
intro ask is friction. RO should surface likely warm paths for each pursued role and draft the
ask — with the user sending it themselves (human-gated-outward, as always).

## Goals

1. Per pursued role: a ranked list of likely warm paths (direct contact at the company,
   2nd-degree via a named mutual, alumni overlap) with the evidence for each.
2. A drafted, truth-gated intro ask per path — user edits and sends from their own tools
   (compose-URL handoff, exactly like Apply; RO never transports).
3. Consent-clean: only data the user explicitly gives us or that is legitimately theirs.

## The decision you need to make (why this hard-stops)

Every path to "who do you know" has a different ToS/privacy footprint:

| Option | Source | ToS/privacy read | Effort |
|---|---|---|---|
| **A — user-provided export (recommended)** | The user uploads THEIR OWN LinkedIn connections CSV (Settings → Data privacy → Get a copy). Their data, exported through LinkedIn's own mechanism; we never touch LinkedIn. | Clean. GDPR-style user-owned data; store under RLS, deletable. | Medium (upload + parse + match UI) |
| **B — Google contacts via existing OAuth** | We already hold Google OAuth; People API gives contacts (names, employers where present). | Clean-ish (scope expansion needs re-consent + Google verification — already a go-live item). Employer data is sparse. | Medium |
| **C — LinkedIn scraping (via Apify or similar)** | Scrape the user's network / company people pages. | **Against LinkedIn ToS; account-ban risk for the USER; legally murky.** Not recommended, listed for completeness. | High + ongoing breakage |
| **D — manual "my people" list** | User types the handful of people they'd actually ask. | Trivially clean. Lowest coverage but honest v0; composes with A later. | Small |

**Recommendation: A + D** (upload for coverage, manual for precision), with B as a later
additive. C is a standing no unless you decide otherwise with eyes open.

## Approach (once approved — not built yet)

`connections` table (owner RLS, deletable in one click): name, company, title, source
(csv|manual), added_at. Matcher: pure company-name normalization + fuzzy match against pursued
roles' companies (no model call for matching). `intro_ask` skill drafts the ask (truth-gated to
the user's profile + the real relationship note they provide); compose-URL handoff for sending.
Paths ranked: direct company match > adjacent (same sector + senior title) > alumni (if the
user's schools are in their profile). Everything else follows house rules: zod, rate limits,
metering, RLS probes, injection tests, a11y.

## Acceptance criteria (for the BUILD slice, post-approval)

1. Upload a LinkedIn connections CSV → parsed count shown → warm paths appear on pursued roles
   with evidence ("Jane D — Acme, Staff PM — direct").
2. Draft an intro ask → truth-gated, editable, compose-URL handoff; nothing sends itself.
3. Delete-my-connections wipes the table (verified in E2E); RLS probes green.
4. Zero external calls to LinkedIn or any people-data vendor.

## Your move

Reply on the PR with the option letter(s) to approve (recommended: **A + D**). The build slice
claims from there.
