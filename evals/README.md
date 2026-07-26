# RoleOS evals

Self-contained, offline evaluation harnesses. Nothing here touches production: no
database, no network, no model calls. Each harness scores an output against labels
and can gate CI.

## Retrieval eval (`retrieval/`)

Scores the matching gate's ranking quality with standard IR metrics -
**precision@k, recall@k, F1, MRR:** over a labeled fixture set.

```bash
npx tsx evals/retrieval/run.ts
```

- `dataset.json`, labeled cases: a query, the role ids a retriever returned
  (best-first), and the human-judged relevant set. Fixture ids are synthetic
  (`r-*`) so the harness runs with zero dependency on the live corpus.
- `metrics.ts`, pure metric functions (unit-testable, no side effects).
- `run.ts`, loads the dataset, prints a per-case table + aggregate, and exits
  non-zero if mean F1 drops below the threshold.

### Wiring it to the real retriever

`run.ts` scores a ranking against labels, it does not call the app. To evaluate
the production retriever, replace each case's `ranked` array with the role ids
`recallRolesMulti` (`lib/match.ts`) returns for that query, mapped to the same id
space as `relevant`. Because the runner and metrics are decoupled from data
collection, you can capture live rankings in a separate script (which does need
Supabase + Workers AI credentials) and feed the resulting JSON here.

See `docs/EVALS.md` for the full strategy (unit → LLM-judge → model evals → A/B)
and which layers are implemented vs. roadmap.

## Coverage-judge eval (`coverage/`)

Scores the résumé coverage judge (`lib/resume/judge.ts`) against human labels —
the honest target is **verdict agreement** ("is this requirement genuinely
evidenced?"), never interview odds (docs/specs/resume-editor-v2.md §"Measured,
not claimed").

```bash
npx tsx evals/coverage/run.ts
```

- `dataset.json`, labeled cases: per requirement, a human **gold** verdict
  (covered/partial/gap) and the judge's **predicted** verdict. Ids are synthetic
  so the harness runs with zero live dependency.
- `metrics.ts`, pure agreement functions — exact accuracy, mean ordinal error,
  **over-credit rate** (the judge being more generous than the human, the
  dangerous direction), and the rolled-up 0–100 score error the disagreement
  causes (via the real scorer, `lib/resume/score.ts`).
- `run.ts`, prints a per-case table + aggregate and exits non-zero below the
  accuracy threshold.

### Wiring it to the live judge

Replace each requirement's `predicted` with what `judgeCoverage` returns for that
(role, bullets) pair, mapped to the same `requirementId` space. Capturing live
predictions needs Workers AI credentials, so do it in a separate script and feed
the resulting JSON here — the runner and metrics stay decoupled from collection.
