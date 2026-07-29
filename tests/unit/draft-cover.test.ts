import { describe, it, expect } from "vitest";
import draftCover from "@/agent/skills/draft_cover";

/**
 * Slice W2 — the draft_cover skill contract: full gate + truth-grounded prompt +
 * a shape check strict enough that the gate never ships a body-less letter
 * (standing learning: every structured skill needs an `expects`).
 */
describe("draft_cover skill", () => {
  it("runs the FULL quality gate (truth + critic), structured", () => {
    expect(draftCover.gate).toBe("full");
    expect(draftCover.structured).toBe(true);
    expect(draftCover.model).toBe("draft");
  });

  it("prompt grounds to the master profile and forbids invention", () => {
    const { system, user } = draftCover.prompt({
      userId: "u1",
      data: {
        role: { company: "Acme", role_title: "Staff PM", must_haves: ["payments"] },
        profile: "REAL PROFILE TEXT",
      },
    });
    expect(system).toContain("TRUTH GATE");
    expect(system).toContain("NEVER invent");
    expect(user).toContain("REAL PROFILE TEXT");
    expect(user).toContain("Acme");
  });

  it("passes the approved résumé angle through when provided", () => {
    const { user } = draftCover.prompt({
      userId: "u1",
      data: {
        role: { company: "Acme" },
        profile: "P",
        resume: { summary: "THE RESUME ANGLE", bullets: [{ text: "bullet one" }] },
      },
    });
    expect(user).toContain("THE RESUME ANGLE");
    expect(user).toContain("bullet one");
  });

  it("expects: accepts a real SECTIONED letter, rejects empty/missing/short/unsectioned", () => {
    const body = "Dear team,\n\n" + "A grounded paragraph about real experience. ".repeat(4) + "\n\nBest,\nAlex";
    const sections = [
      { id: "opening", text: "A real hook.", rationale: "r" },
      { id: "why_them", text: "Their stage fits.", rationale: "r" },
      { id: "why_you", text: "Real proof mapped to must-haves.", rationale: "r" },
      { id: "closing", text: "A plain ask.", rationale: "r" },
    ];
    const ok = JSON.stringify({ subject: "Application — Staff PM", body, sections, angle: "payments depth", truth_note: "" });
    expect(draftCover.expects!(ok)).toBe(true);
    // J10.2: a flat letter without sections is no longer accepted from the drafter.
    expect(draftCover.expects!(JSON.stringify({ subject: "s", body }))).toBe(false);
    expect(draftCover.expects!(JSON.stringify({ subject: "s", body: "too short", sections }))).toBe(false);
    expect(draftCover.expects!(JSON.stringify({ body, sections }))).toBe(false);
    expect(draftCover.expects!(JSON.stringify({ subject: "s", body, sections: sections.slice(0, 2) }))).toBe(false);
    expect(draftCover.expects!("not json at all")).toBe(false);
  });
});
