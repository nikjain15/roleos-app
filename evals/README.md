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

## Live-corpus retrieval eval (`retrieval/live/`)

Scores a **real retriever over the REAL role corpus** — the 689 extracted
postings in `seed/roles/*.json` that also seed the production `roles` table — so
the numbers are on the actual corpus, not synthetic `r-*` fixtures. Runs offline
in CI (no DB, no Workers AI, no secrets) and is asserted by
`tests/unit/retrieval-live.test.ts`.

```bash
npm run eval:retrieval:live
```

- `corpus.ts` loads the real postings into flat docs (title, keywords, surface,
  responsibilities, must-haves) — deliberately **excluding** the human `archetype`
  label so archetype-based relevance stays independent of the retriever's features.
- `retriever.ts` is a deterministic TF-IDF retriever that mirrors the **shape** of
  the production `recallRolesMulti` (`lib/match.ts`): a single-query rank and a
  **multi-query union** that keeps each role's best score across facets (the
  offline analogue of `mergeHits`).
- `queries.json` is the frozen label set — 10 hand-specified real queries with
  relevant role-id sets derived from the `archetype` label + explicit text
  constraints (regenerate with `npx tsx evals/retrieval/live/build-queries.ts`).
- `run.ts` reports **precision@k / recall / F1 / MRR** for single- vs multi-query
  and the **A/B lift**, and gates on: multi-query precision@10 ≥ 0.5, MRR ≥ 0.7,
  and multi ≥ single on both precision@10 and recall@36.

Latest run (TF-IDF lexical baseline, 10 queries, 689 roles): multi-query
**precision@10 0.650, MRR 0.933**; multi beats single on precision (+0.010), MRR
(+0.013) and recall@36 (+0.008). F1 is structurally low because the archetype
relevant sets (70–163 roles) dwarf k — precision@k + MRR are the meaningful SLA
here, which is why the gate uses them, not F1.

### Scoring the production semantic retriever (bge/pgvector)

The lexical baseline needs no creds; the real bge/pgvector retriever is scored by
the **same metrics** via the capture script this README used to only promise:

```bash
SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… \
CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… \
  npm run eval:retrieval:capture
```

It runs `recallRoles` + `recallRolesMulti` over the live corpus for each frozen
query and writes `dataset.semantic.json` (read-only; nothing is written to prod).
Not run in CI (no secrets there) — the lexical live eval gates CI.

## Synthetic retrieval eval (`retrieval/run.ts`)

The original self-contained harness over synthetic `r-*` fixtures — still useful
as a pure metrics smoke test. See `docs/EVALS.md` for the full strategy
(unit → LLM-judge → model evals → A/B) and which layers are implemented vs. roadmap.
