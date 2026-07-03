import { describe, it, expect } from "vitest";
import { deriveNextAction, enteredStageAt, slaState, STAGE_SLA_DAYS } from "@/lib/tracker";

/**
 * Slice W5 — tracker depth. Pure funnel-hygiene logic: per-stage SLAs from the
 * append-only history, and deterministic next-action derivation (no model call).
 */
const NOW = new Date("2026-07-10T12:00:00Z");

describe("enteredStageAt", () => {
  it("uses the LAST history entry (the current stage's entry time)", () => {
    const h = [
      { stage: "saved", at: "2026-07-01T00:00:00Z" },
      { stage: "applied", at: "2026-07-05T00:00:00Z" },
    ];
    expect(enteredStageAt(h, "fallback")).toBe("2026-07-05T00:00:00Z");
    expect(enteredStageAt([], "fb")).toBe("fb");
    expect(enteredStageAt(null, "fb")).toBe("fb");
  });
});

describe("slaState", () => {
  it("ok inside the window, due on the boundary day, overdue past it", () => {
    // applied SLA = 7 days
    expect(slaState("applied", "2026-07-08T12:00:00Z", NOW).state).toBe("ok"); // 2d
    expect(slaState("applied", "2026-07-03T12:00:00Z", NOW).state).toBe("due"); // 7d
    expect(slaState("applied", "2026-07-01T12:00:00Z", NOW).state).toBe("overdue"); // 9d
  });

  it("terminal stages have no SLA — always ok", () => {
    expect(slaState("rejected", "2026-01-01T00:00:00Z", NOW).state).toBe("ok");
    expect(slaState("withdrawn", "2026-01-01T00:00:00Z", NOW).state).toBe("ok");
  });

  it("garbage timestamps degrade to 0 days, never NaN or crash", () => {
    const s = slaState("applied", "not-a-date", NOW);
    expect(s.daysInStage).toBe(0);
    expect(s.state).toBe("ok");
  });
});

describe("deriveNextAction", () => {
  it("every non-terminal stage gets a concrete next step with a due date", () => {
    for (const stage of ["saved", "drafting", "ready", "applied", "screening", "interviewing", "onsite", "offer"]) {
      const na = deriveNextAction(stage, { enteredAt: "2026-07-01T00:00:00Z" });
      expect(na, stage).not.toBeNull();
      expect(na!.label.length, stage).toBeGreaterThan(10);
      expect(na!.due, stage).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("due = entered + the stage's SLA days", () => {
    const na = deriveNextAction("applied", { enteredAt: "2026-07-01T00:00:00Z" });
    expect(na!.due).toBe("2026-07-08"); // +7d
    expect(STAGE_SLA_DAYS.applied).toBe(7);
  });

  it("terminal stages and unknown stages derive nothing", () => {
    expect(deriveNextAction("rejected", { enteredAt: "2026-07-01T00:00:00Z" })).toBeNull();
    expect(deriveNextAction("withdrawn", { enteredAt: "2026-07-01T00:00:00Z" })).toBeNull();
    expect(deriveNextAction("bogus", { enteredAt: "2026-07-01T00:00:00Z" })).toBeNull();
  });

  it("saved adapts to an approved résumé", () => {
    expect(deriveNextAction("saved", { enteredAt: "2026-07-01T00:00:00Z", hasApprovedResume: true })!.label).toContain(
      "approved résumé",
    );
  });
});
