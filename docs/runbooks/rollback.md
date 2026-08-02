# Runbook, rollback when RO is producing wrong output

> **The scenario this is written for.** A prompt change or a model change is live.
> The five gates are running and producing wrong output: résumés with claims that
> are not in the profile, matches that read as nonsense, a coach that has lost RO's
> voice, or a gate that has started refusing everything. The code is up, the health
> check is green, nothing has thrown. This is the failure mode where "is the site
> up?" is the wrong question.
>
> Written 2026-08-02, against finding SH8. Never executed against production,
> because there has never been an incident. Every timing below is an estimate from
> the deploy path, not a measured recovery. Treat the first real use as the test of
> this document as much as of the fix.

---

## 0 · What tells you

There is exactly one automated signal today, and it is honest about its own limits.

| Signal | Where it comes from | What it means |
|---|---|---|
| `quality_health.breached` | `lib/quality-health.ts`, emitted from the `agent_runs` write path | Over the last 60 minutes, at least 20 user-facing runs, and either the `needs_your_eyes` rate is 25% or higher, or the `unknown`-confidence rate is 35% or higher. RO's own gate has stopped vouching for RO's output. |
| `quality_health.warn` | same | 15% / 20%. Look, do not roll back yet. |
| `cost_budget.exceeded` | `lib/cost-budget.ts` | Rolling 24h spend past the budget. Often the second symptom of a bad prompt: a broken gate escalates, and escalation costs money. |

**Nothing pages anyone.** These are structured JSON lines in Cloudflare Workers
Logs. There is no alert destination, no rotation, and no escalation policy. In
practice the first report of a bad prompt will come from a person, either the
author or a user. That is the largest remaining gap in this runbook and it is
recorded as open in `docs/STAKEHOLDERS.md`; wiring a Workers Logs alert to
`event: "quality_health.breached"` is a console configuration step, not a code
change.

To look manually:

```bash
npx wrangler tail --format json | grep quality_health
```

Or open `/admin` (the Models and evals surface) and read the gate pass rate and
the recent-runs table straight from `agent_runs`.

---

## 1 · Decide: is this a rollback or a stand-down?

Answer one question first, because the two paths are different.

**Is the bad output reaching users right now?**

- **Yes, and it is wrong in a way that could harm someone** (a résumé asserting a
  job the candidate never held; a screening answer that misrepresents them) →
  **roll back**, section 2. A fabricated claim on a document a person sends to an
  employer is the worst outcome this product has, and it is worth an outage.
- **Yes, but it is merely bad** (flat voice, weak matches, gate refusing too much)
  → **roll back** on the same path, but there is no need to panic; finish reading
  the ladder and pick the smallest step that works.
- **No, it is a batch or overnight path** (`/api/cron/hunt`, digests) → **stand
  down the job** rather than rolling back the app. Disable the cron trigger in the
  Cloudflare dashboard for the `roleos-cron` worker. Nothing user-facing changes,
  and you get time to fix it properly.

---

## 2 · The rollback ladder, smallest blast radius first

Take the first step that plausibly covers the change. Do not start at the bottom.

### Step A · Model registry only (about 5 minutes)

**Use when:** the change was a model swap or a params change in
`agent/registry.json`, which is by design the file you change to swap a model
without touching code.

1. `git revert` the commit that touched `agent/registry.json`, or hand-edit the
   `jobs.<name>.model` back to the previous value.
2. Push to `main`. CI runs, and on green, `deploy.yml` ships the exact commit CI
   verified.
3. **Elapsed:** CI is roughly 3 to 5 minutes (typecheck, lint, import invariant,
   vitest, audit gate, secret scan) plus the Playwright job, then the OpenNext
   build and Cloudflare deploy, roughly 3 to 4 minutes. Call it 8 to 10 minutes
   end to end.

### Step B · Revert the prompt or skill commit (about 10 minutes)

**Use when:** a skill file under `agent/skills/` or a system prompt in
`agent/quality-gate.ts` changed.

1. `git log --oneline -- agent/` to find it. Skills are one file each on purpose,
   so the revert is usually a single file.
2. `git revert <sha>` and push. Same CI and deploy path as Step A.
3. **Elapsed:** 8 to 12 minutes.

### Step C · Roll the whole worker back to the last known-good deploy (about 2 minutes)

**Use when:** you do not yet know what changed, or the change spans several files,
or a revert would itself need review you do not have time for. This is the fastest
step in the ladder and there is no shame in reaching for it first when the output
is harmful.

1. Cloudflare dashboard → Workers and Pages → the RoleOS worker → **Deployments**
   → find the previous known-good version → **Rollback**.
   Or: `npx wrangler deployments list` then `npx wrangler rollback [version-id]`.
2. **Elapsed:** the rollback itself propagates in under a minute. Call it 2
   minutes including finding the right version.
3. **Then immediately** revert the offending commit on `main` too. A dashboard
   rollback does not change the repository, and the next push to `main` will
   redeploy the bad code. This is the step most likely to be forgotten under
   pressure, which is why it is written as part of Step C rather than after it.

### Step D · Stop the ambient jobs (about 2 minutes)

**Use when:** the bad output is being generated in the background and stacking up
in people's Tracker "Ready" lanes, or spending money.

1. Cloudflare dashboard → the `roleos-cron` worker → Settings → Triggers → disable
   the cron schedules. (`cron/worker.ts` fires `/api/cron/digests`, `/nudges`,
   `/ingest` hourly, `/yc-sync` daily, `/hunt` and `/purge` nightly.)
2. Note that disabling the nightly slot also stops the **retention purge**, which
   is the job that makes the windows in `docs/PRIVACY.md` real. Do not leave it
   off for more than a day, and re-enable it explicitly rather than assuming
   someone did.

### Step E · Rotate a credential (see the other runbook)

Only if the incident is a suspected key compromise rather than bad output.
`docs/runbooks/secret-rotation.md` owns that path end to end.

---

## 3 · What you cannot roll back

Stated plainly, because discovering it during an incident is worse.

- **Artifacts already generated.** A tailored résumé that was drafted with the bad
  prompt is a row in `artifacts` and it stays there. Rolling back the code does not
  rewrite it. If the output was materially wrong, the affected artifacts have to be
  found (`select id, user_id, created_at from artifacts where created_at between …`)
  and the users told. There is no in-product correction surface and no support
  channel: `docs/STAKEHOLDERS.md` lists both as open.
- **Anything a user already sent.** RO has no send capability by design (the
  no-send invariant), so nothing left the building on RO's initiative. But a user
  may have copied a bad draft into an employer's form. That is not recoverable and
  it is the reason the harm question in section 1 comes first.
- **Embeddings.** If the incident involved a re-embed, rolling back the app does
  not restore the previous vectors. Re-run `npm run seed:embeddings`.

---

## 4 · Confirm recovery

Do not close on "the deploy went green".

1. `curl -s https://ro.roleos.fyi/api/health` returns `{"ok":true}`.
2. Run one real generation through the affected gate and read the output yourself.
   The gate's own verdict is not sufficient here: the whole scenario is that the
   gate was passing bad output.
3. Watch `quality_health` for one full window (60 minutes, and it needs 20
   user-facing runs before any rate means anything). Low traffic means the signal
   may simply not fill; in that case the confirmation is step 2, repeated.
4. Check `/admin` shows the gate pass rate back at its previous level.

---

## 5 · The incident becomes a permanent eval case

This is the step that makes the incident worth something, and it is not optional.
An incident that only produced a rollback will happen again.

1. **Capture the exact input and the exact bad output** while you still have them.
   `agent_runs` records cost and verdicts, **not prompt text**, deliberately (see
   `docs/PRIVACY.md`), so if you do not capture it during the incident it is gone.
   Strip personal data before it goes anywhere near the repository: use a
   synthesised profile that reproduces the failure, never a real candidate's CV.
2. **Choose where it belongs:**
   - Bad output the gate should have caught, from a candidate-supplied document →
     a case in `tests/unit/injection-guard.test.ts` or
     `tests/unit/quality-gate.test.ts`, with the model transport mocked to
     reproduce the bad reply. These run on every PR.
   - A truth-gate miss (a claim not in the profile that shipped anyway) → a
     labelled triple in the truth-gate eval set. That set does not exist yet; it is
     the roadmap item named in `docs/EVALS.md` Layer 3, and an incident is the best
     possible reason to start it.
   - A coverage-judge disagreement → a row in `evals/coverage/dataset.json`, scored
     by `tests/unit/coverage-eval-gate.test.ts`.
   - A retrieval regression → a labelled query in `evals/retrieval/live/queries.json`.
     Note the limit honestly: that eval scores a TF-IDF stand-in, not the shipped
     bge retriever (see `tests/unit/retrieval-live.test.ts`), so a semantic
     regression will not be caught there until `dataset.semantic.json` is captured.
3. **Write the assertion so it FAILS against the reverted-to code as well**, if the
   bug was latent before the change that exposed it. A test that only fails on the
   bad commit is a changelog entry, not a regression test.
4. **Record the incident in `docs/DECISION_LOG.md`**: what changed, what it broke,
   which ladder step was used, how long it actually took, and which eval case now
   covers it. The timings in section 2 above are estimates, and the first real
   incident is the chance to replace them with measurements.

---

## 6 · Known gaps in this runbook

Listed rather than left to be discovered.

- **No page.** Detection is a log line nobody is subscribed to (section 0).
- **Never rehearsed.** No game day, no drill. The Cloudflare rollback path in Step
  C has not been exercised on this worker.
- **Single operator.** There is one person who can do any of this. There is no
  rotation and no second pair of eyes.
- **No user-facing correction path.** Section 3's "tell the affected users" has no
  mechanism behind it: no support address in the app, no announcement surface.
- **Timings are estimates.** Every duration above is derived from the deploy
  pipeline's normal runtime, not from a measured recovery.
