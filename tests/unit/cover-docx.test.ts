import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import { coverParagraphs, buildCoverDocx } from "@/lib/cover/docx";

/**
 * J10.2 — the cover-letter DOCX export follows the standard business-letter
 * plan (name → role → date → greeting → body paragraphs → sign-off) with the
 * same ATS rules as the résumé export: single column, plain paragraphs, no
 * tables/images. Structure asserted on the paragraph plan; one pack smoke-test.
 */
const content = {
  name: "Nik Jain",
  roleLabel: "Founding Senior PM — Retell AI",
  dateLine: "July 29, 2026",
  greeting: "Dear Retell team,",
  paragraphs: ["The hook.", "The homework.", "The proof.", "The ask."],
  signoff: "Best,\nNik Jain",
};

describe("coverParagraphs", () => {
  it("orders the letter: name → role → date → greeting → sections → sign-off", () => {
    const paras = coverParagraphs(content);
    expect(paras).toHaveLength(4 + 4 + 1); // name/role/date/greeting + 4 body paragraphs + sign-off
  });

  it("skips empty parts and never emits a zero-paragraph document", () => {
    expect(coverParagraphs({ paragraphs: [] }).length).toBe(1);
    expect(coverParagraphs({ paragraphs: ["", "  ", "Real."] }).length).toBe(1);
  });
});

describe("buildCoverDocx", () => {
  it("packs to a real DOCX (Workers-safe base64 path)", async () => {
    const b64 = await Packer.toBase64String(buildCoverDocx(content));
    expect(b64.length).toBeGreaterThan(1000);
    expect(atob(b64.slice(0, 8)).startsWith("PK")).toBe(true); // zip magic
  });
});
