import { describe, it, expect } from "vitest";
import {
  lockApproveEvents,
  tuneAcceptEvent,
  exportEvent,
  judgeCalibration,
  type ResumeFeedbackRow,
} from "@/lib/resume/feedback";
import type { ResumeExperience } from "@/lib/resume/doc";

/**
 * P4 — the résumé calibration substrate: pure event-builders for the real feedback
 * signals, and the honest, derived judge read-back (counting in the open, shrinkage,
 * never a prediction).
 */

const exp = (id: string, lines: Array<[string, boolean]>): ResumeExperience => ({
  id,
  company: "C",
  title: "T",
  lines: lines.map(([lid, locked]) => ({ id: lid, text: "x", locked })),
});

describe("lockApproveEvents — only NEWLY locked lines emit an approve", () => {
  it("emits one approve per line that just became locked", () => {
    const prev = [exp("exp0", [["exp0-l0", true], ["exp0-l1", false]])];
    const next = [exp("exp0", [["exp0-l0", true], ["exp0-l1", true]])]; // l1 newly locked
    const rows = lockApproveEvents(prev, next, "a1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "resume", action: "approve", payload: { signal: "lock", lineId: "exp0-l1", artifactId: "a1" }, weight: 1 });
  });
  it("emits nothing when nothing newly locked (and ignores unlocks)", () => {
    const prev = [exp("exp0", [["exp0-l0", true]])];
    const next = [exp("exp0", [["exp0-l0", false]])]; // unlocked → not a signal here
    expect(lockApproveEvents(prev, next, "a1")).toEqual([]);
  });
});

describe("tuneAcceptEvent / exportEvent", () => {
  it("a scoped tune is an edit signal at higher weight", () => {
    expect(tuneAcceptEvent("a1", "lead with the AI work", "exp0")).toMatchObject({
      kind: "resume",
      action: "edit",
      payload: { signal: "tune", sectionId: "exp0" },
      weight: 2,
    });
  });
  it("a whole-résumé tune has null sectionId", () => {
    expect(tuneAcceptEvent("a1", "one page").payload).toMatchObject({ signal: "tune", sectionId: null });
  });
  it("export is a trust (approve) signal", () => {
    expect(exportEvent("a1", "docx")).toMatchObject({ action: "approve", payload: { signal: "export", format: "docx" } });
  });
});

describe("judgeCalibration — derived, honest, shrunk", () => {
  const rows = (...specs: Array<[string, string]>): ResumeFeedbackRow[] =>
    specs.map(([action, signal]) => ({ action, payload: { signal } }));

  it("counts trust vs correction and stays silent under the floor", () => {
    const cal = judgeCalibration(rows(["approve", "lock"], ["approve", "export"]));
    expect(cal.trusted).toBe(2);
    expect(cal.corrected).toBe(0);
    expect(cal.note).toBeNull(); // 2 signals < floor
  });

  it("surfaces a read-back once there's enough signal", () => {
    const cal = judgeCalibration(
      rows(["approve", "lock"], ["approve", "lock"], ["approve", "export"], ["edit", "tune"], ["correct", "reground"]),
    );
    expect(cal.trusted).toBe(3);
    expect(cal.corrected).toBe(2); // tune + correct
    expect(cal.signals).toBe(5);
    // shrunk: 2 / (5 + 2)
    expect(cal.correctionRate).toBeCloseTo(2 / 7);
    expect(cal.note).toContain("2 corrections vs 3 kept");
  });

  it("empty → zeros, no note, no NaN", () => {
    const cal = judgeCalibration([]);
    expect(cal).toMatchObject({ signals: 0, correctionRate: 0, note: null });
  });
});
