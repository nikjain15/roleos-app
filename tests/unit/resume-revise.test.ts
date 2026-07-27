import { describe, it, expect } from "vitest";
import { applyRevision, parseChanges } from "@/lib/resume/revise";
import type { ResumeExperience } from "@/lib/resume/doc";

/**
 * P3 — the pure revise enforcement: scope (only the tuned section changes), locks
 * (a ✓-approved line is never rewritten), and truth headers (employer never
 * renamed). We never trust the model to honor these; this caps its output.
 */

const exp = (id: string, company: string, lines: Array<[string, string, boolean?]>): ResumeExperience => ({
  id,
  company,
  title: "T",
  dates: "2020",
  lines: lines.map(([lid, text, locked]) => ({ id: lid, text, locked })),
});

const current: ResumeExperience[] = [
  exp("exp0", "CredR", [
    ["exp0-l0", "original A", false],
    ["exp0-l1", "LOCKED B", true],
  ]),
  exp("exp1", "EdCast", [["exp1-l0", "original C", false]]),
];

describe("applyRevision — scope", () => {
  it("a section tune leaves every other section verbatim", () => {
    const revised: ResumeExperience[] = [
      exp("exp0", "CredR", [["exp0-l0", "reworded A", false]]),
      exp("exp1", "EDITED CO", [["exp1-l0", "reworded C", false]]),
    ];
    const out = applyRevision(current, revised, { sectionId: "exp0" });
    expect(out[1]).toEqual(current[1]); // exp1 untouched, incl. company name
    expect(out[0].lines[0].text).toBe("reworded A");
  });

  it("a whole-résumé revise touches all sections", () => {
    const revised: ResumeExperience[] = [
      exp("exp0", "CredR", [["exp0-l0", "reworded A", false], ["exp0-l1", "IGNORED", true]]),
      exp("exp1", "EdCast", [["exp1-l0", "reworded C", false]]),
    ];
    const out = applyRevision(current, revised, {});
    expect(out[0].lines[0].text).toBe("reworded A");
    expect(out[1].lines[0].text).toBe("reworded C");
  });
});

describe("applyRevision — locks", () => {
  it("restores a locked line's text even if the model rewrote it", () => {
    const revised = [exp("exp0", "CredR", [["exp0-l0", "reworded A", false], ["exp0-l1", "model tried to change B", false]])];
    const out = applyRevision(current, revised, { sectionId: "exp0" });
    const locked = out[0].lines.find((l) => l.id === "exp0-l1")!;
    expect(locked.text).toBe("LOCKED B");
    expect(locked.locked).toBe(true);
  });

  it("re-inserts a locked line the model dropped, at its position", () => {
    const revised = [exp("exp0", "CredR", [["exp0-l0", "reworded A", false]])]; // dropped the locked line
    const out = applyRevision(current, revised, { sectionId: "exp0" });
    const ids = out[0].lines.map((l) => l.id);
    expect(ids).toContain("exp0-l1");
    expect(out[0].lines.find((l) => l.id === "exp0-l1")!.text).toBe("LOCKED B");
  });
});

describe("applyRevision — truth headers", () => {
  it("never renames the employer/title/dates from the revise", () => {
    const revised = [exp("exp0", "FAKE COMPANY", [["exp0-l0", "reworded A", false]])];
    const out = applyRevision(current, revised, { sectionId: "exp0" });
    expect(out[0].company).toBe("CredR");
    expect(out[0].title).toBe("T");
    expect(out[0].dates).toBe("2020");
  });

  it("keeps a section the model omitted entirely", () => {
    const out = applyRevision(current, [], {});
    expect(out).toEqual(current);
  });
});

describe("parseChanges — the change-log, tolerant", () => {
  it("keeps valid entries, defaults bad types to reframed, drops empty", () => {
    expect(
      parseChanges([
        { type: "dropped", target: "line 3", why: "off-topic for this role" },
        { type: "nonsense", target: "summary", why: "tightened" },
        { target: "", why: "" },
        "garbage",
      ]),
    ).toEqual([
      { type: "dropped", target: "line 3", why: "off-topic for this role" },
      { type: "reframed", target: "summary", why: "tightened" },
    ]);
  });
  it("returns [] for non-arrays", () => {
    expect(parseChanges(null)).toEqual([]);
    expect(parseChanges("x")).toEqual([]);
  });
});
