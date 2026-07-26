# Résumé editor v2 — craft with RO (design spec)

> Status: **direction approved 2026-07-26** (iterated live with the user). The
> AI-first rebuild of "Tailor my résumé" — replaces the document-reviewer prototype
> (`proto/resume-editor/`) and the old `/studio/resume/[id]`. Lives in **Studio ›
> Résumé** (see the nav/IA restructure). Built strictly on the design system
> (tokens + `components/ui`). Extends, not replaces, the existing `/api/tailor` +
> truth-gate.

## Philosophy — RO crafts *with* you, honestly

Not a form you fill or a doc you proofread. RO drafts a résumé **tailored to a
specific role**, shows her reasoning, and you steer in plain English — *your words
always win*. Three non-negotiables:

1. **AI-first & directable** — RO authors the first draft against the posting and
   rewrites on natural-language commands ("make the founder years pop", "one page").
2. **Grounded, never inflated** — every line traces to your master profile
   (truth-gate). A gap stays a gap until *real* evidence covers it. We say "thin for
   this role" before we pad.
3. **Honest signal, not score-theater** — the score measures **how well your résumé
   makes your case for this role**, NOT your odds of an interview. We never predict
   outcomes we don't control.

## One master → many tailored résumés

- **Master profile** (the canonical profile, `master_profile.data.profile`) = the
  single source of truth, your whole career. Never mutated by tailoring.
- **Per role you pursue**, RO derives a **separate tailored résumé artifact**
  (`/studio/resume/[id]`, one per role/application). Each has its **own** score,
  scored against **that** role. A résumé tuned for Scale AI scores for Scale AI.
- Approving/editing a line can optionally propose a **master upgrade**
  (propose-and-approve) so a good rewrite flows back — never silently.

## The editor UX (single column, document-first)

Decluttered — no competing side rail. Top → bottom:

1. **Readiness meter (slim)** — the honest gamified score (below): tier badge + a
   tiered track (Solid → Strong → Fully evidenced) + `+N from your master` + **one
   next move** ("surface your Gen-AI proof · +4") + the caveat line ("how strongly
   your résumé makes your case — not your odds").
2. **The document** — the tailored résumé, calm and beautiful. Per **experience
   section**: a **section-strength pill** (`★ strong · 92` / `△ thin for this role
   · 61`) + a **"tune this section →"** scoped-adjust, and RO's one-line read when a
   section is weak.
3. **Per line:** inline-**editable** (your words), a **✓ approve** tick that
   **locks the line** (RO won't touch it again unless you ask), and an **✎** that
   reveals *why RO wrote it* + alternative drafts.
4. **One pinned command bar** — whole-résumé adjusts in plain English + chips.
5. **Export** DOCX/PDF, gated on grounded ✓, "survives the interview room" +
   "→ into your application bundle". Progress: "N of M lines ✓".

## The score — how it's calculated (grounded)

The score = **coverage of the role's stated requirements by your real evidence.**

**Inputs (both grounded, no invention):**
- **Role requirements** — structured from the posting (`roles.must_haves`,
  `nice_to_haves`, archetype, seniority, comp). Weighted: must-have ≫ nice-to-have.
- **Résumé bullets** — the tailored artifact, every line truth-gated to the master.

**Pipeline (per-requirement → section → overall):**
1. **Evidence retrieval** — embed each requirement + each bullet (Cloudflare `bge`);
   cosine surfaces candidate evidence. Cheap, live-recomputable on edit.
2. **Coverage judge** (LLM, draft/reason tier) — for each requirement, decides
   **covered / partial / gap** with a one-line reason (handles "adjacent proof").
   → a 0–1 coverage per requirement.
3. **Section strength** = the same coverage math scoped to one experience block
   (which requirements does *this* section evidence?).
4. **Roll-up 0–100** — importance-weighted sum of covered + partial requirements,
   **calibrated** so the tiers mean something consistent.
5. **`+N from your master`** — run the *same* scorer on master vs tailored → the
   tailoring lift (real, comparable).
6. **The next move (`+4`)** — the single uncovered requirement whose evidence would
   raise the score most. Actionable, not vague.

**Honest tiers (about the résumé, never the outcome):**
`Solid` → `Strong` → `Fully evidenced` (every stated requirement has real evidence).
No "interview-ready" / "top of the stack" — those imply odds we can't promise.

## Keeping the algorithm strong + self-improving (dig-deep)

A score is worthless if it's not grounded and doesn't improve. But it must improve
**honestly** — we tune how well it judges *coverage/quality*, not a fabricated
outcome oracle.

**1. What we optimize for.** Primary target = **coverage judgment accuracy**: does
the scorer agree with a careful human read of "is this requirement genuinely
evidenced?" This is measurable and honest, and doesn't claim to predict interviews.

**2. Feedback signals → `decision_events` (the same substrate as taste):**
- **✓ approve / edit a line** — which phrasings the user trusts; edits that change a
  requirement's coverage teach the judge.
- **Accept vs reject a "tune"/"adjust"** — which rewrites actually helped.
- **Export/send** — they trusted it enough to use it (positive).
- **Outcome** (interview / reject, from the tracker) — a **weak, noisy, long-horizon
  signal** we *watch* to sanity-check calibration, but **never** promise on or
  present as a prediction.

**3. The loop (honest version).**
- The coverage judge + weights/thresholds are recalibrated from human-labeled
  coverage agreement + the feedback signals above.
- Outcomes are used only to **detect miscalibration** ("scores cluster high but
  interviews don't follow → our weighting is off"), never to output "you'll get an
  interview." Transparent: "recalibrated from N labels."
- **Guardrail:** the truth-gate caps the score — it can never rise by inventing
  evidence. A gap persists until real evidence covers it.

**4. Measured, not claimed.** A held-out eval set of `(résumé, role, human-coverage-
labels)` tracks the scorer's agreement over time (the J8 §5 eval-ladder pattern), so
"improving" is provable, not asserted. Model/threshold changes ship behind this eval.

## "What I tuned" & "Tell me to adjust" — mechanics

- **What I tuned** = the tailor skill's **structured change-log** vs the master:
  `{type: moved | reframed | dropped | added, target, why}`, each `why` tied to a
  role requirement. Surfaced per-line (✎) and per-section. Truth-gated.
- **Tell me to adjust** = a **revise-by-instruction** skill: `(instruction + current
  résumé + role + master) → revised résumé`, through the truth-gate, **scoped** (a
  section tune only touches that section) and **respecting locks** (never rewrites a
  ✓-approved line). Concrete verbs: *add metrics* (real numbers from master), *one
  page* (trim lowest-coverage lines), *more technical*, *punchier*, *surface X proof*
  (find the closest true evidence, or say honestly it isn't there). Re-scores after.

## Export & formatting — industry standard (hard requirement)

What leaves must look like a résumé a recruiter respects and an ATS can parse —
**both DOCX and PDF**, identical layout. Not an afterthought; a P2 acceptance gate.

- **Format rules (market-standard, ATS-safe):** single-column (no text in tables/
  text-boxes/graphics that break parsers); clear hierarchy — Name + title + contact
  → optional summary → Experience (Company · Title · Dates, then bullets) → Skills →
  Education; standard fonts; consistent spacing/margins; **1 page (2 for senior)**.
- **DOCX** — extend the existing `docx`-lib export (pack via
  `Packer.toBase64String` per the Workers gotcha). **PDF** — the print route →
  client-side PDF (no headless Chrome on Workers). Both render from ONE layout
  definition so they never diverge.
- **Validate against real market samples:** before shipping the export, gather
  well-regarded professional résumé templates (the clean single-column style
  recruiters + ATS handle) and check our output against them — section order,
  spacing, typography, one-page discipline. Don't invent a format; match what wins.
- Grounded only (truth-gate) — formatting never inflates content.

## Data model (mostly exists)

- Tailored résumé = an **artifact** per role (`/studio/resume/[id]`). Store the
  document, the per-line source-trace, the change-log, the latest score + coverage
  breakdown, and locked-line flags.
- Master = `master_profile.data.profile` (P1). Read-only to tailoring; edits go
  through propose-and-approve.
- Feedback = `decision_events` (append-only). Calibration model derived, like taste.

## What exists vs what we build
- **Exists:** `/api/tailor` + tailor skill, truth-gate, `roles` requirements, `bge`
  embeddings, `outcome-learning`, `decision_events`, the artifact/résumé route.
- **Build:** the per-requirement **coverage scorer** + section scoping, the honest
  **readiness meter** UI, the tailor skill's **structured change-log**, the
  **revise-by-instruction** skill (scoped + lock-aware), **line-locking**, and the
  **scorer eval harness** + outcome-watched calibration.

## Build phases (own slices)
- **P1** — coverage scorer (`lib/resume/score.ts`, pure roll-up + skill) + eval
  fixtures. Section + overall. Honest tiers.
- **P2** — the editor UI in Studio › Résumé (readiness meter, per-section strength,
  editable lines + ✓ lock, alternatives) on the design system.
- **P3** — revise-by-instruction (global + section-scoped) + change-log surfacing.
- **P4** — calibration loop (feedback → `decision_events` → recalibration) + eval
  ladder + outcome-watch.

## Guardrails
Truth-gate on every line (no inflation) · score is coverage/craft, **never an
outcome prediction** · human-gated-outward (export ≠ send) · ro-voice (a thin
section is candid, not shaming) · design system is the contract.
