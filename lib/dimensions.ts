import type { Rates } from "@/lib/plan/types";

/**
 * The 15-dimension self-learning model (goal-engine.md §7). A canonical taxonomy +
 * an HONEST derivation from the user's real signals — dimensions with real evidence
 * get a calibrated inference + confidence; the rest are transparently "still
 * learning" (null inference, low confidence). We never fabricate a preference.
 *
 * Pure + tested. The server aggregates raw signals; this maps them to dimensions.
 * Stored/overridable per user (`taste_dimensions`) so it's transparent + correctable.
 */
export type DimGroup = "fit" | "craft" | "voice" | "cadence" | "plan";

export interface DimensionDef {
  id: number; // 1–15
  key: string;
  label: string;
  group: DimGroup;
}

export const DIMENSIONS: DimensionDef[] = [
  { id: 1, key: "archetype_fit", label: "Role archetype fit", group: "fit" },
  { id: 2, key: "seniority_fit", label: "Seniority fit", group: "fit" },
  { id: 3, key: "company_stage_fit", label: "Company-stage fit", group: "fit" },
  { id: 4, key: "domain_fit", label: "Domain fit", group: "fit" },
  { id: 5, key: "resume_voice", label: "Résumé voice", group: "voice" },
  { id: 6, key: "truthfulness_bar", label: "Truthfulness bar", group: "voice" },
  { id: 7, key: "story_emphasis", label: "Story emphasis", group: "craft" },
  { id: 8, key: "keyword_priorities", label: "Keyword priorities", group: "craft" },
  { id: 9, key: "outreach_tone", label: "Outreach tone", group: "voice" },
  { id: 10, key: "cadence", label: "Notification cadence", group: "cadence" },
  { id: 11, key: "interview_focus", label: "Interview focus", group: "craft" },
  { id: 12, key: "negotiation_posture", label: "Negotiation posture", group: "craft" },
  { id: 13, key: "location_preference", label: "Location / remote preference", group: "fit" },
  { id: 14, key: "funnel_calibration", label: "Funnel calibration", group: "plan" },
  { id: 15, key: "effort_intensity", label: "Effort & intensity", group: "plan" },
];

/** Aggregated signals the server computes from the user's real data. */
export interface Signals {
  saves: number;
  dismisses: number;
  pursues: number;
  resumeEdits: number; // edit/correct decision_events on résumés
  resumeApproves: number;
  rates: Rates | null; // blended funnel rates (with per-stage n)
  cadence: string | null; // profiles.notif_settings.cadence
  intensity: { hours_per_week?: number; apps_per_week_ceiling?: number } | null;
}

export interface DimensionInference {
  id: number;
  key: string;
  label: string;
  group: DimGroup;
  inference: string | null; // null = still learning
  confidence: number; // 0–1
  basis: string; // what evidence this rests on (transparency)
}

/** Confidence from a sample size (saturating; ~0.7 at n≈12). */
function conf(n: number, cap = 0.85): number {
  if (n <= 0) return 0.1;
  return Math.min(cap, 0.25 + 0.6 * (1 - Math.exp(-n / 8)));
}

export function deriveDimensions(s: Signals): DimensionInference[] {
  const byKey: Record<string, { inference: string | null; confidence: number; basis: string }> = {};
  const learning = (basis = "not enough signal yet") => ({ inference: null, confidence: 0.1, basis });

  const curated = s.saves + s.dismisses + s.pursues;
  const selectivity =
    curated >= 3
      ? {
          inference:
            s.dismisses > s.saves + s.pursues
              ? "Selective — you rule out more than you keep"
              : "Open — you keep more than you cut",
          confidence: conf(curated),
          basis: `${curated} curate actions (${s.saves + s.pursues} kept, ${s.dismisses} dismissed)`,
        }
      : learning("keep saving/dismissing roles and this sharpens");

  // Fit dims share the curate signal for now (per-archetype split is future work).
  for (const k of ["archetype_fit", "seniority_fit", "company_stage_fit", "domain_fit", "location_preference"]) {
    byKey[k] = selectivity;
  }

  // Voice + truthfulness — from how much you rework RO's drafts.
  const resumeActs = s.resumeEdits + s.resumeApproves;
  byKey.resume_voice =
    resumeActs >= 2
      ? {
          inference:
            s.resumeEdits > s.resumeApproves
              ? "Hands-on — you edit RO's drafts into your own words"
              : "Trusting — you mostly accept RO's grounded draft",
          confidence: conf(resumeActs),
          basis: `${s.resumeEdits} edits, ${s.resumeApproves} accepted as-is`,
        }
      : learning("edit or approve a résumé and this sharpens");
  byKey.truthfulness_bar = byKey.resume_voice;

  // Cadence — the user set it explicitly, so it's high-confidence.
  byKey.cadence = s.cadence
    ? { inference: `You chose "${s.cadence}" notifications`, confidence: 0.9, basis: "your Settings choice" }
    : learning("set a notification cadence in Settings");

  // Funnel calibration (dim 14) — real conversions once you have data.
  if (s.rates) {
    const n = s.rates.apply_to_screen.n;
    byKey.funnel_calibration =
      n > 0
        ? {
            inference: `Your apply→interview rate is ~${Math.round(s.rates.apply_to_screen.mid * 100)}% (from ${n} applications)`,
            confidence: conf(n),
            basis: `${n} tracked applications`,
          }
        : {
            inference: "Using senior-PM benchmarks until you have data",
            confidence: 0.3,
            basis: "no applications tracked yet — priors in use",
          };
  } else {
    byKey.funnel_calibration = learning("apply to roles and RO learns your real rates");
  }

  // Effort & intensity — from the goal.
  byKey.effort_intensity = s.intensity?.apps_per_week_ceiling
    ? {
        inference: `~${s.intensity.apps_per_week_ceiling} apps/week${s.intensity.hours_per_week ? `, ${s.intensity.hours_per_week} hrs` : ""}`,
        confidence: 0.85,
        basis: "your goal's intensity",
      }
    : learning("set your intensity in the Goal Setter");

  return DIMENSIONS.map((d) => ({
    id: d.id,
    key: d.key,
    label: d.label,
    group: d.group,
    ...(byKey[d.key] ?? learning()),
  }));
}
