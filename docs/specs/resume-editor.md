# PRD - Résumé Editor

> Status: **DRAFT for build** · Roadmap slot: **Now #3** · Owner: Nik
> Journey stage: Tailor (stage 3). Upgrades `/studio/resume/[id]` from a
> review-only draft into a real editing surface.

## Problem statement

Today RO produces a truth-gated tailored résumé at `/studio/resume/[id]` that the
user can only **accept ("make it mine") or reject** - there's no editing. Because the
Sonnet drafter reliably over-embellishes, most drafts land **"needs your eyes,"** and
the user has no in-product way to fix a flagged line - they're stuck. There's also **no
export**, so even an approved résumé can't leave the app as a PDF or DOCX. The stage
that should feel like *craft* feels like a gate.

## Goals

1. Turn the résumé into an **editable, side-by-side canvas** - original CV ↔ tailored
   draft - where the user resolves flags and edits inline.
2. Make the **truth gate a helper, not a wall**: flagged lines are actionable in place
   (accept RO's grounded rewrite, edit yourself, or revert).
3. Ship **PDF and DOCX export** so an approved résumé is usable immediately.
4. Measurable: **≥70%** of started résumés reach "approved & exported" (vs. today's
   stall at "needs your eyes"); median **time-to-approved < 5 min** of active editing.

## Non-goals

- **Multi-template / heavy visual design system** - one clean, ATS-safe layout for v1.
- **Cover letters / other artifacts** - separate specs; this is the résumé only.
- **Real-time multi-device co-editing** - single user, single session.
- **Removing the truth gate** - it stays; we make it *resolvable*, not absent.

## User stories

- As a **job seeker**, I want the tailored draft **next to my real CV** so I can see
  exactly what changed and trust it.
- As a **job seeker**, I want each **flagged line** to show why it was flagged and give
  me one-click options: *use RO's grounded version*, *edit it myself*, or *revert to
  my original*, so I'm never stuck.
- As a **job seeker**, I want to **edit any line directly** (not just flagged ones) so
  the résumé is truly mine.
- As a **job seeker**, I want a **live "grounded / needs-your-eyes" status** as I edit,
  so I know when it's clean.
- As a **job seeker**, I want to **export to PDF and DOCX** so I can submit it anywhere.
- As a **job seeker**, I want my edits **saved** so I can leave and come back.

## Requirements

### Must-have (P0)

| # | Requirement | Acceptance criteria |
|---|---|---|
| P0-1 | **Two-pane canvas**: left = source (master profile / original CV), right = editable tailored résumé (summary + bullets). | Given a tailored artifact, when I open the editor, then I see source and draft side by side; on mobile they stack with a toggle. |
| P0-2 | **Inline flag chips** on lines the truth gate flagged, with the reason on hover/expand. | Every flagged line is visually marked; clicking shows the specific truth-gate rationale (traces to master_profile). |
| P0-3 | **Resolve actions per flag**: *Use grounded version* (RO's re-grounded line), *Edit myself*, *Revert to original*. | Choosing any option clears the flag for that line and updates the draft; the choice writes a `decision_event`. |
| P0-4 | **Free editing** of any line (inline contenteditable / field). | I can edit non-flagged lines; edits persist. |
| P0-5 | **Live truth status**: a header state that recomputes clean/needs-eyes as flags resolve. | When the last flag is resolved, status flips to "grounded" and the Export action enables. |
| P0-6 | **Autosave** to the artifact row (RLS-scoped). | Edits survive reload; reopening shows my latest state. |
| P0-7 | **Export PDF + DOCX** of the approved résumé, ATS-safe layout. | Export produces a clean file; DOCX opens in Word with selectable text (not an image). |

### Should-have (P1)

- **Keyword lift panel**: which JD keywords are covered / missing (from the tailor skill's `keywords`/`fit_lift`).
- **Undo/redo** stack.
- **Version pins**: keep the original draft alongside my edited version.
- **Per-bullet "why RO wrote this"** rationale (already produced by the draft skill).

### Could-have / future (P2)

- Multiple templates; length target (1 vs 2 pages) with overflow warnings.
- Re-tailor a single bullet against a *different* role without regenerating the whole résumé.
- Cover-letter companion reusing the same canvas.

## Design intent

- The **truth gate becomes interactive** rather than terminal - this directly attacks
  the "everything lands needs-your-eyes" stall noted in the build log. The grounded
  rewrite already exists (truth-driven auto-revise); we surface it per line instead of
  as a batch pass.
- Export uses a server-side render (the `docx` lib for DOCX; a print/HTML→PDF path for
  PDF). No new model calls for export.
- Lives in the app shell under **Résumé**; entered from a Roles Workspace "pursue" or
  from the Feed.

## Success metrics

**Leading:** started→approved→exported rate (≥70%); flags-resolved per résumé; median
active editing time (<5 min); export format split. **Lagging:** résumés exported per
active user; applications sent that used an exported résumé (ties into the Apply spec);
satisfaction on the tailoring step.

## Open questions

- **(eng)** PDF path - headless render vs. client print-to-PDF; which gives ATS-safe,
  selectable text most cheaply on Cloudflare?
- **(eng)** Is the stored artifact granular enough to mark flags at the **line** level,
  or do we need to persist line ids in the tailor output?
- **(design)** When a user edits a flagged line themselves, do we **re-run the truth
  check on their text**, or trust user edits as authored-by-them (they own their claims)?

## Timeline / phasing

**Phase A (P0-1..6):** editable two-pane canvas + resolvable flags + autosave - the
core unlock. **Phase B (P0-7):** export. Export can trail the editor by a short beat,
but both are needed before this counts as "done" for the journey.
