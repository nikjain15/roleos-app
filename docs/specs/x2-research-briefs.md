# X2, Company research briefs (PRD)

## Problem

Users apply and interview blind on the company: what it actually hires for, what it values,
whether it says comp out loud, what to prep. That context EXISTS in RO's own corpus, every
open role at the company, extracted must-haves, comp where stated, sector/batch metadata -
but nobody assembles it into the two-minute brief you want before you hit send.

## Goals

1. A **company brief on the Apply page**: what the company is, its hiring signal (the role mix
   IS strategy), what it values across its postings, an honest comp read, and prep pointers -
   generated on the user's click, grounded ONLY in RO's stored data.
2. **Honest unknowns**: whatever the corpus can't support (funding, news, culture reviews) is
   listed as *not known*, never fabricated. That honesty is the feature.
3. Persisted per company (notifications kind `company_brief`) so re-opening is free.

## Non-goals (v1, deliberate)

- **No external fetching.** v2 may add a flag-gated, fixed-host fetch of the company's OWN
  homepage/press page; that's a separate slice with its own egress review.
- **No interviewer briefs.** Person-level research (LinkedIn etc.) has real ToS/privacy
  exposure, that half of the board line needs an explicit human product decision first, and is
  OUT of this slice.
- No comp benchmarks beyond what postings state (X5's territory).

## Approach / sources (ToS-safe by construction)

First-party rows only: `companies` (name, sector, yc_batch, homepage, ats_provider),
all `roles` at the company (titles, must_haves, nice_to_haves, comp where stated, ≤50),
and the target role. Skill `company_brief` (draft tier, full gate, `tools: []`, structured):
`{overview, hiring_signal, what_they_value[≤5], comp_read, prep_pointers[≤4], unknowns[≤4]}`.
`POST /api/brief {roleId}`, auth → zod → 6/h per-user rate limit (`rate_events`) → gather →
skill (metered) → store as notification (kind `company_brief`, payload keyed by company) →
return. BriefCard on `/apply/[id]`; latest brief for that company renders free.

## Guardrails

Grounded-only prompt + full gate; unknowns explicit; human-gated (click-to-run); no egress;
metered; rate-limited; RLS; zod. No person data anywhere.

## Acceptance criteria

1. Click on the Apply page → brief with overview, hiring signal, values, comp read, prep
   pointers, and a non-empty `unknowns` list (v1 always has unknowns, honesty check).
2. Persisted: reopening the Apply page for the same company renders the stored brief free.
3. 401 unauth · 400 junk · 404 foreign/unknown role · 429 over 6/h, all without model spend.
4. The brief never asserts funding/news/culture facts (not in the sources), spot-checked in
   the model-gated E2E via the unknowns list.
