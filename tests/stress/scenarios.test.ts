import { describe, it, expect } from "vitest";
import { assessProfileInput } from "@/lib/profile-input";
import { parseModelJson } from "@/lib/json";
import { computePlan, addDays } from "@/lib/plan/plan";
import { computeAgenda } from "@/lib/plan/agenda";
import { mapFlags } from "@/lib/resume/flags";
import { computeRates } from "@/lib/plan/rates";
import { observedFromApplications } from "@/lib/plan/observed";
import { deriveDimensions } from "@/lib/dimensions";

/**
 * Stress-test harness (Slice 11) — the scenario library (AUDIT-DIMENSIONS) run over
 * the pure engines. Every edge case must **degrade honestly, never crash and never
 * fabricate confidence**. (Model/DB-dependent scenarios — persona E2E, live
 * cross-user RLS, prompt-injection through the model — are covered by the invariant
 * tests + the manual/preview audit; these lock the deterministic core.)
 */
const today = "2026-07-03";

describe("thin / URL-only input degrades honestly", () => {
  it("flags a bare URL as too thin (won't fake a shortlist)", () => {
    const a = assessProfileInput("https://linkedin.com/in/someone");
    expect(a.ok).toBe(false);
    expect(a.hadUrl).toBe(true);
  });
  it("flags a 30-char scrap as too thin", () => {
    expect(assessProfileInput("Senior PM. Fintech.").ok).toBe(false);
  });
  it("accepts a real profile", () => {
    expect(assessProfileInput("Senior product manager with ten years building payments and fraud platforms at fintech scale-ups").ok).toBe(true);
  });
});

describe("malformed model output fails closed", () => {
  it("unparseable JSON → null (caller surfaces needs-your-eyes, never a crash)", () => {
    expect(parseModelJson("not json at all {")).toBeNull();
    expect(parseModelJson("")).toBeNull();
  });
  it("recovers fenced / trailing-comma JSON", () => {
    expect(parseModelJson('```json\n{"a":1,}\n```')).toEqual({ a: 1 });
  });
});

describe("goal edge cases stay honest", () => {
  it("deadline shorter than one interview cycle → off_track + extend lever", () => {
    const p = computePlan({ deadline_date: addDays(today, 12), deadline_hard: true }, { today, liveSupply: 100 });
    expect(p.feasibility.verdict).toBe("off_track");
    expect(p.feasibility.bestLever).toMatch(/extend/i);
  });
  it("goal with no matching supply → at_risk + broaden lever", () => {
    const p = computePlan({ deadline_date: "2026-11-01", intensity: { apps_per_week_ceiling: 50 } }, { today, liveSupply: 0 });
    expect(p.feasibility.verdict).toBe("at_risk");
    expect(p.feasibility.bestLever).toMatch(/broaden/i);
  });
  it("funnel counts are honest ranges (low ≤ mid ≤ high)", () => {
    const f = computePlan({ deadline_date: "2026-10-01" }, { today, liveSupply: 100 }).funnel;
    for (const r of [f.applications, f.screens, f.onsites]) {
      expect(r.low).toBeLessThanOrEqual(r.mid);
      expect(r.mid).toBeLessThanOrEqual(r.high);
    }
  });
});

describe("empty states always offer a way forward (never a dead end)", () => {
  it("agenda returns a move even with an empty pipeline", () => {
    const plan = computePlan({ deadline_date: "2026-12-01" }, { today, liveSupply: 100 });
    const a = computeAgenda({ plan, pursueRoles: 0, readyArtifacts: 0, appsThisWeek: 0 });
    expect(a.length).toBeGreaterThan(0);
  });
  it("no goal → agenda points to setting one", () => {
    const plan = computePlan({}, { today, liveSupply: 0 });
    expect(computeAgenda({ plan, pursueRoles: 0, readyArtifacts: 0, appsThisWeek: 0 })[0].id).toBe("set-goal");
  });
});

describe("résumé truth flags: clean vs all-flagged", () => {
  const bullets = [{ text: "Led a 40-person team building a $2B payments platform" }];
  it("no violations → grounded", () => {
    expect(mapFlags(bullets, []).grounded).toBe(true);
  });
  it("a violation → not grounded, with something to resolve", () => {
    const m = mapFlags(bullets, ["leading a 40-person team on the payments platform overstates scope"]);
    expect(m.grounded).toBe(false);
    expect(m.byBullet.length + m.documentLevel.length).toBeGreaterThan(0);
  });
});

describe("self-learning never fabricates", () => {
  it("no applications → funnel rates fall back to priors (n=0)", () => {
    const r = computeRates(observedFromApplications([]));
    expect(r.apply_to_screen.n).toBe(0);
  });
  it("no signal → all 15 dimensions honest (null inference, low confidence)", () => {
    const d = deriveDimensions({
      saves: 0, dismisses: 0, pursues: 0, resumeEdits: 0, resumeApproves: 0,
      rates: null, cadence: null, intensity: null,
    });
    expect(d).toHaveLength(15);
    expect(d.every((x) => x.inference === null && x.confidence <= 0.15)).toBe(true);
  });
});
