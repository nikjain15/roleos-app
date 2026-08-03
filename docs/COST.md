# Cost

What one candidate costs to run through RoleOS, where that money actually goes, and which
lever would move it.

Regenerate with `npm run cost:model`. The figures come from
[`scripts/cost-model.mjs`](../scripts/cost-model.mjs), which reads `agent/registry.json`
directly. Every model id, output ceiling and price below is the config that routes real
traffic, not a number retyped into a document.

## The ladder RoleOS already has

`agent/registry.json` maps each job to a tier, an output ceiling and a price. That is the
cost design, and it predates this document:

| Job | Model | Max out | ~In | ~Typical out | Typical/call | Ceiling/call |
|---|---|---|---|---|---|---|
| `reason` | claude-opus-4-8 | 4096 | 3000 | 2048 | $0.07 | $0.12 |
| `draft` | claude-sonnet-4-6 | 8192 | 4000 | 4915 | $0.09 | $0.13 |
| `code` | claude-sonnet-4-6 | 16000 | 2000 | 11200 | $0.17 | $0.25 |
| `quick_tag` | claude-haiku-4-5 | 1024 | 375 | 205 | $0.00140 | $0.00549 |
| `critic` | claude-opus-4-8 | 1536 | 2500 | 922 | $0.04 | $0.05 |

**The ceiling column is the only number here that is neither estimated nor assumed.**
`max_tokens` is enforced by the provider, so "worst case per call" is a real bound. Everything
else is a projection.

## One candidate, end to end

3 `reason`, 4 `draft`, 12 `quick_tag`, 2 `critic`, 1 `code`.

| | |
|---|---|
| Typical | **$0.80** |
| Every call at its ceiling | **$1.31** (hard bound, not a forecast) |
| Every call on `claude-opus-4-8` | **$1.22** |

At 200 candidates a month: **$161** as tiered, **$243** if everything ran on the top tier.
The tiering saves about **$82 a month**, or 34%.

## Where the money actually goes, and why that is the surprise

| Job | Calls | Model | Cost | Share |
|---|---|---|---|---|
| `draft` | 4 | Sonnet | $0.343 | **43%** |
| `reason` | 3 | Opus | $0.199 | 25% |
| `code` | 1 | Sonnet | $0.174 | **22%** |
| `critic` | 2 | Opus | $0.071 | 9% |
| `quick_tag` | 12 | Haiku | $0.017 | 2% |

**Two thirds of the bill is on Sonnet, not Opus.** `draft` and `code` together are 65% of a
candidate's cost, and neither runs on the expensive tier. The Opus jobs are only a third.

That inverts the usual assumption, and it changes which lever is worth pulling. Moving
`reason` and `critic` to a cheaper model would save at most 34%, would degrade the two jobs
where quality matters most, and is the lever everyone reaches for first. It is the wrong one
here.

**The real driver is output length, not model tier.** `code` carries a 16,000-token ceiling and
`draft` 8,192; `quick_tag` carries 1,024 and costs 2% of the journey across twelve calls.
Output tokens are priced at 5x input on every tier, so a job's ceiling matters more than its
model. The registry comment on `code` already says the large budget is deliberate, so that the
whole allowance goes to code rather than reasoning tokens. That is a defensible choice. It is
also the single most expensive line in the product.

**The honest read: RoleOS is not obviously overspending.** Tiering is already in place and
correctly assigned, the cheap tier absorbs the highest call volume, and the expensive tier is
reserved for matching, the mirror, negotiation and adversarial grading. There is no easy win
here of the kind Rally had. If cost becomes a problem, the first thing to measure is what
share of `draft` and `code` output ceilings is really being used.

## What is measured, estimated, and assumed

This section is the point of the document. A cost table without it is decoration.

| | |
|---|---|
| **Measured from config** | every model id, every `max_tokens` ceiling, every price in `cost_per_mtok`. Read from `agent/registry.json`, not retyped |
| **Estimated** | token counts, as characters / 4. The largest source of error, and not calibrated against Anthropic's tokenizer |
| **Assumed** | prompt sizes per job, what share of each output ceiling a typical call uses, the call counts in the journey, and 200 candidates a month |

**Every dollar figure is an order of magnitude, not a bill.**

The journey call counts are the least arbitrary of the assumptions: they are informed by where
each job is actually invoked in the codebase, 11 `quick_tag` call sites against 4 `draft` and
3 `reason`. The output-usage fractions are the softest. `code` at 70% of a 16,000-token
ceiling is a guess, and it drives 22% of the total.

## What would replace all of this with measurements

**RoleOS already records the truth.** `callModel` in `agent/registry.ts` writes real input and
output token counts and a real cost to `agent_runs` on every call, and `lib/admin-stats.ts`
already aggregates cost per run, per model and per skill. Cost tracking is in the call path,
not bolted on.

So one day of live traffic makes this script redundant for everything except forecasting. Until
that traffic exists, this is a model, and it says so.

## Two things this document does not claim

**The tiering has not been validated, only chosen.** `quick_tag` runs on Haiku because Haiku is
the cheap tier, not because Haiku was measured as good enough on RoleOS's own examples. Same for
`draft` on Sonnet. That comparison belongs in the eval suite and needs a keyed run. Until then
the ladder is a reasonable design decision and not a validated one.

**There is no caching.** Unlike Rally, no path here repeats identical inputs often enough to make
content-addressed caching obviously worthwhile, and RoleOS's prompts carry per-candidate context
that would not repeat. Prompt caching is the more plausible fit: `draft` sends roughly 4,000
characters of prompt, which is around 1,000 tokens, still under the 4,096-token minimum Haiku
requires and near the 1,024 minimum for Sonnet. Worth measuring against real prompts before
building anything.

## Related

Prices were audited across all five products on 2026-08-02. RoleOS was one of two that had them
right. Rally and FounderFirst both carried Opus at $15/$75, which is Opus-3-era pricing feeding a
live meter, and Conduit billed unpriced models at zero. RoleOS's per-job `cost_per_mtok` rows
matched the published rates exactly.
