import { describe, it, expect } from "vitest";
import { formatCv } from "@/lib/resume/cv-format";

/**
 * The "Your CV" reference formatter: markdown-ish blob → clean heading/bullet/text
 * blocks (no raw asterisks), tolerant of dividers and blank lines.
 */
describe("formatCv", () => {
  it("classifies headings, bullets, and paragraphs; strips markers", () => {
    const raw = [
      "**SUMMARY**",
      "AI PM with **enterprise** experience.",
      "",
      "**Director | Fidelity (2023–Present)**",
      "- Lead AI/ML product strategy",
      "- Present to C-suite",
      "---",
      "# Skills",
      "* NLP",
    ].join("\n");
    expect(formatCv(raw)).toEqual([
      { type: "head", text: "SUMMARY" },
      { type: "text", text: "AI PM with enterprise experience." },
      { type: "head", text: "Director | Fidelity (2023–Present)" },
      { type: "bullet", text: "Lead AI/ML product strategy" },
      { type: "bullet", text: "Present to C-suite" },
      { type: "head", text: "Skills" },
      { type: "bullet", text: "NLP" },
    ]);
  });

  it("tolerates empty / whitespace input", () => {
    expect(formatCv("")).toEqual([]);
    expect(formatCv("   \n\n  ")).toEqual([]);
  });
});
