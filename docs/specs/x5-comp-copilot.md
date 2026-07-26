# X5, Comp intelligence + offer decision co-pilot (PRD)

## Problem

Two money moments go unsupported: **calibration** (is this posting's pay in range for the
market I'm in?) and **decision** (two offers, different shapes, which fits MY priorities?).
Users guess at both; the corpus and simple math can answer both honestly.

## Comp data source (the decision this PRD makes)

**v1 = stated ranges in RO's own corpus.** Measured 2026-07-03: 1,536 roles, **691 carry a
`comp` field**, of which a meaningful subset state `base_range_usd` outright (pay-transparency
postings). Benchmarks = percentiles over STATED ranges only, grouped by archetype, always
shown **with n:** small n is displayed, never hidden. External feeds (levels.fyi, H1B data,
paid comp APIs) are explicitly deferred: each is its own ToS/paid decision.

## Goals

1. **Benchmark**: for an archetype (default: the user's goal target), p25/p50/p75 of stated
   base ranges + n + example roles, honest "from postings that state pay" framing.
2. **Offer co-pilot**: enter up to 3 offers (base, total-comp estimate, equity notes, and
   1–5 self-ratings on growth/life-fit/mission), set priority weights, get a transparent
   weighted comparison, the MATH is shown, the decision stays the user's. Zero model calls.
3. **Privacy**: offers never leave the browser in v1 (localStorage, validated parse, clearable)
   - comp is the most sensitive thing a user types.

## Non-goals

- External comp feeds (deferred, per above)., Negotiation drafting (the existing `/api/negotiate`
  skill already does this; the co-pilot links to it per offer)., Equity valuation modeling
  (equity is captured as notes + the user's own total-comp estimate, not priced by us).

## Approach

`lib/comp.ts`: pure `summarizeRanges` (midpoint percentiles + n), pure `compareOffers`
(normalized weighted score across base / total / growth / life-fit / mission; ties honest),
pure `parseOffers` (localStorage is untrusted). `GET /api/comp-benchmark?archetype=` (authed,
bounded service read of stated ranges, no model). `/offers` page: benchmark strip (from the
goal's archetype) + offer editor + weight sliders + the comparison table with the arithmetic
visible. Added to the a11y sweep.

## Acceptance criteria

1. Benchmark returns p25/50/75 + n for an archetype with stated-comp postings; an archetype
   with none returns an honest empty (n=0), not an error.
2. Two seeded offers + weights → deterministic winner with visible per-dimension scores;
   changing a weight flips the winner when the math says so (unit-tested exactly).
3. Offers persist across reload (browser-only), survive corrupted storage, and clear in one click.
4. 401 unauth on the API; no model calls anywhere in the slice.
