import { describe, it, expect } from "vitest";
import {
  parseResumeDoc,
  scorerBullets,
  scorerSections,
  flattenLines,
  updateLineAt,
} from "@/lib/resume/doc";

/**
 * P2 — the structured résumé document model. Reads the new experience-section
 * shape, upgrades the legacy flat bullet list, and produces the scorer adapters
 * (bullets + sections) with stable, aligned ids. Pure, tolerant, non-breaking.
 */

const sectioned = {
  summary: "Senior AI PM.",
  experience: [
    {
      company: "Acme",
      title: "Co-founder & PM",
      dates: "2015–2021",
      lines: [
        { text: "Built the ML platform", evidence: "master:acme" },
        { text: "Grew revenue 3x" },
      ],
    },
    { company: "Globex", title: "Product", lines: [{ text: "Shipped an LLM assistant" }] },
  ],
  keywords_injected: ["LLM", "evals"],
};

describe("parseResumeDoc — new experience-section shape", () => {
  it("keeps sections, assigns stable ids, preserves headers + evidence", () => {
    const doc = parseResumeDoc(sectioned);
    expect(doc.summary).toBe("Senior AI PM.");
    expect(doc.experience).toHaveLength(2);
    expect(doc.experience[0].id).toBe("exp0");
    expect(doc.experience[0].company).toBe("Acme");
    expect(doc.experience[0].dates).toBe("2015–2021");
    expect(doc.experience[0].lines[0].id).toBe("exp0-l0");
    expect(doc.experience[0].lines[0].evidence).toBe("master:acme");
    expect(doc.experience[1].lines[0].id).toBe("exp1-l0");
    expect(doc.keywords_injected).toEqual(["LLM", "evals"]);
  });
});

describe("parseResumeDoc — legacy flat bullets upgrade", () => {
  it("wraps a flat bullet list into a single implicit section", () => {
    const doc = parseResumeDoc({
      summary: "s",
      bullets: [{ text: "Led ML platform", evidence: "e" }, { text: "Grew rev 3x" }],
    });
    expect(doc.experience).toHaveLength(1);
    expect(doc.experience[0].id).toBe("exp0");
    expect(doc.experience[0].title).toBe("Experience");
    expect(doc.experience[0].lines.map((l) => l.id)).toEqual(["exp0-l0", "exp0-l1"]);
  });

  it("tolerates malformed/empty content → empty-but-valid doc", () => {
    expect(parseResumeDoc(null).experience).toEqual([]);
    expect(parseResumeDoc({ bullets: "nope" }).experience).toEqual([]);
    expect(parseResumeDoc(undefined).summary).toBe("");
  });

  it("drops blank lines and header-less empty sections", () => {
    const doc = parseResumeDoc({ experience: [{ company: "", title: "", lines: [{ text: "  " }] }] });
    expect(doc.experience).toEqual([]);
  });
});

describe("scorer adapters — aligned ids for evidence + section strength", () => {
  it("scorerBullets flattens all lines in document order", () => {
    const doc = parseResumeDoc(sectioned);
    expect(scorerBullets(doc)).toEqual([
      { id: "exp0-l0", text: "Built the ML platform" },
      { id: "exp0-l1", text: "Grew revenue 3x" },
      { id: "exp1-l0", text: "Shipped an LLM assistant" },
    ]);
  });

  it("scorerSections groups line ids under each experience, id-aligned to bullets", () => {
    const doc = parseResumeDoc(sectioned);
    const sections = scorerSections(doc);
    expect(sections).toEqual([
      { id: "exp0", title: "Co-founder & PM", bulletIds: ["exp0-l0", "exp0-l1"] },
      { id: "exp1", title: "Product", bulletIds: ["exp1-l0"] },
    ]);
    // every section bulletId is a real scorer bullet id
    const bulletIds = new Set(scorerBullets(doc).map((b) => b.id));
    for (const s of sections) for (const id of s.bulletIds) expect(bulletIds.has(id)).toBe(true);
  });

  it("section title falls back to company then a default", () => {
    const doc = parseResumeDoc({ experience: [{ company: "Init", title: "", lines: [{ text: "x" }] }] });
    expect(scorerSections(doc)[0].title).toBe("Init");
  });

  it("flattenLines gives a stable global index across sections", () => {
    const flat = flattenLines(parseResumeDoc(sectioned));
    expect(flat.map((f) => f.globalIndex)).toEqual([0, 1, 2]);
    expect(flat[2]).toMatchObject({ expId: "exp1", expIndex: 1, lineIndex: 0, globalIndex: 2 });
  });
});

describe("updateLineAt — change one line by global index (reground/edit)", () => {
  it("replaces the targeted line's text across sections, leaving others intact", () => {
    const doc = parseResumeDoc(sectioned);
    const next = updateLineAt(doc, 2, (line) => ({ ...line, text: "REGROUNDED" }));
    expect(next[0].lines.map((l) => l.text)).toEqual(["Built the ML platform", "Grew revenue 3x"]);
    expect(next[1].lines[0].text).toBe("REGROUNDED");
    // preserves id + other fields
    expect(next[1].lines[0].id).toBe("exp1-l0");
  });

  it("is a no-op for an out-of-range index", () => {
    const doc = parseResumeDoc(sectioned);
    const next = updateLineAt(doc, 99, () => ({ id: "x", text: "no" }));
    expect(next).toEqual(doc.experience);
  });
});
