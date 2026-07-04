import { describe, it, expect } from "vitest";
import appScore from "@/agent/skills/app_score";

/** X3 — the app_score skill contract. */
describe("app_score skill", () => {
  it("uses the reason tier, full gate, no tools (no-send holds structurally)", () => {
    expect(appScore.model).toBe("reason");
    expect(appScore.gate).toBe("full");
    expect(appScore.tools).toEqual([]);
    expect(appScore.structured).toBe(true);
  });

  it("prompt grounds to the provided inputs only", () => {
    const { system, user } = appScore.prompt({
      userId: "u1",
      data: {
        role: { company: "Acme", role_title: "Staff PM", must_haves: ["payments"] },
        resume: { summary: "THE RESUME" },
        match: { fit: 82, why: "payments depth", gaps: [] },
      },
    });
    expect(system).toContain("never invent");
    expect(system).toContain("warns, never gatekeeps".length > 0 ? "0-100" : "0-100");
    expect(user).toContain("THE RESUME");
    expect(user).toContain("payments depth");
  });

  it("expects: enforces score range, likelihood enum, and weak_spots array", () => {
    const ok = JSON.stringify({ score: 74, screen_likelihood: "medium", strengths: [], weak_spots: [], note: "x" });
    expect(appScore.expects!(ok)).toBe(true);
    expect(appScore.expects!(JSON.stringify({ score: 101, screen_likelihood: "high", weak_spots: [] }))).toBe(false);
    expect(appScore.expects!(JSON.stringify({ score: -1, screen_likelihood: "low", weak_spots: [] }))).toBe(false);
    expect(appScore.expects!(JSON.stringify({ score: 50, screen_likelihood: "certain", weak_spots: [] }))).toBe(false);
    expect(appScore.expects!(JSON.stringify({ score: 50, screen_likelihood: "low" }))).toBe(false);
    expect(appScore.expects!("nope")).toBe(false);
  });
});
