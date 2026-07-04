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

  it("expects: accepts a real letter, rejects empty/missing/short bodies", () => {
    const ok = JSON.stringify({
      subject: "Application — Staff PM",
      body: "Dear team,\n\n" + "A grounded paragraph about real experience. ".repeat(4) + "\n\nBest,\nAlex",
      angle: "payments depth",
      truth_note: "",
    });
    expect(draftCover.expects!(ok)).toBe(true);
    expect(draftCover.expects!(JSON.stringify({ subject: "s", body: "too short" }))).toBe(false);
    expect(draftCover.expects!(JSON.stringify({ body: "x".repeat(200) }))).toBe(false);
    expect(draftCover.expects!(JSON.stringify({ subject: "s" }))).toBe(false);
    expect(draftCover.expects!("not json at all")).toBe(false);
  });
});
