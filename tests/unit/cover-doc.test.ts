import { describe, it, expect } from "vitest";
import { parseCoverDoc, compileBody, toContent, COVER_TUNE_PRESETS } from "@/lib/cover/doc";
import { applyCoverTune } from "@/lib/cover/revise";

/**
 * J10.2 — sectioned cover-letter doc model + tune enforcement. Pure; the truth
 * gate is tested elsewhere — here we prove structure: legacy compatibility,
 * section round-trip, and that scope/locks are enforced in code (never trusted
 * to the model).
 */
const sectioned = {
  subject: "Founding PM — Retell",
  greeting: "Dear Retell team,",
  signoff: "Best,\nNik",
  sections: [
    { id: "opening", text: "Voice is the next platform.", rationale: "hook to their space", locked: false },
    { id: "why_them", text: "Your API-to-platform move mirrors my work.", rationale: "their stage", locked: false },
    { id: "why_you", text: "At CredR I shipped two conversational AI products.", rationale: "the proof", locked: true },
    { id: "closing", text: "I'd welcome a conversation.", rationale: "plain ask", locked: false },
  ],
  body: "compiled elsewhere",
  angle: "founder energy",
  truth_note: "",
};

describe("parseCoverDoc", () => {
  it("reads the new sectioned shape with labels derived from ids", () => {
    const doc = parseCoverDoc(sectioned);
    expect(doc.sections.map((s) => s.id)).toEqual(["opening", "why_them", "why_you", "closing"]);
    expect(doc.sections[0].label).toMatch(/hook/i);
    expect(doc.sections[2].locked).toBe(true);
    expect(doc.greeting).toBe("Dear Retell team,");
  });

  it("reads a LEGACY flat body as one editable 'letter' section", () => {
    const doc = parseCoverDoc({ subject: "s", body: "Dear team,\n\nThe old flat letter.\n\nBest", angle: "a" });
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].id).toBe("letter");
    expect(doc.sections[0].text).toContain("old flat letter");
  });

  it("drops empty sections and survives garbage", () => {
    expect(parseCoverDoc(null).sections).toHaveLength(0);
    expect(parseCoverDoc({ sections: [{ id: "opening", text: "  " }], body: "" }).sections).toHaveLength(0);
  });
});

describe("compileBody / toContent", () => {
  it("compiles greeting + sections + signoff with blank lines", () => {
    const body = compileBody(parseCoverDoc(sectioned));
    expect(body.startsWith("Dear Retell team,")).toBe(true);
    expect(body.endsWith("Best,\nNik")).toBe(true);
    expect(body).toContain("Voice is the next platform.\n\nYour API-to-platform move");
  });

  it("toContent always carries the compiled flat body (apply-bundle compatible) and round-trips", () => {
    const doc = parseCoverDoc(sectioned);
    const content = toContent(doc);
    expect(content.body).toBe(compileBody(doc));
    const again = parseCoverDoc(content);
    expect(again.sections.map((s) => s.text)).toEqual(doc.sections.map((s) => s.text));
    expect(again.sections[2].locked).toBe(true);
  });
});

describe("applyCoverTune — scope + lock enforcement (never trust the model)", () => {
  const doc = parseCoverDoc(sectioned);

  it("rewrites ONLY the target section", () => {
    const r = applyCoverTune(doc, "opening", "A sharper hook.", { note: "sharpened" });
    expect(r.applied).toBe(true);
    expect(r.doc.sections[0].text).toBe("A sharper hook.");
    expect(r.doc.sections.slice(1).map((s) => s.text)).toEqual(doc.sections.slice(1).map((s) => s.text));
    expect(r.doc.subject).toBe(doc.subject);
  });

  it("refuses to touch a ✓-kept section", () => {
    const r = applyCoverTune(doc, "why_you", "Invented new proof.");
    expect(r.applied).toBe(false);
    expect(r.doc.sections[2].text).toBe(doc.sections[2].text);
    expect(r.note).toMatch(/kept/i);
  });

  it("no-ops on unknown section or empty rewrite", () => {
    expect(applyCoverTune(doc, "nope", "text").applied).toBe(false);
    expect(applyCoverTune(doc, "opening", "   ").applied).toBe(false);
  });
});

describe("tune presets", () => {
  it("every section job has presets and the legacy section falls back", () => {
    for (const id of ["opening", "why_them", "why_you", "closing", "letter"]) {
      expect(COVER_TUNE_PRESETS[id]?.length).toBeGreaterThanOrEqual(3);
    }
  });
});
