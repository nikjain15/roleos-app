import { describe, it, expect } from "vitest";
import { Packer } from "docx";
import { resumeParagraphs, buildResumeDoc } from "@/lib/resume/docx";

const content = {
  name: "Alex Rivera",
  headline: "Tailored for Acme — Staff PM",
  summary: "Senior PM with a payments background.",
  bullets: [{ text: "Shipped a billing platform." }, { text: "Cut churn 12%." }, { text: "" }],
  keywords_injected: ["payments", "roadmap"],
};

describe("resumeParagraphs", () => {
  it("emits name, headline, summary, experience bullets, and keywords", () => {
    const paras = resumeParagraphs(content);
    // name + headline + (Summary heading + body) + (Experience heading + 2 non-empty bullets)
    // + (Skills heading + body) = 9
    expect(paras.length).toBe(9);
  });

  it("drops empty bullets", () => {
    const paras = resumeParagraphs({ bullets: [{ text: "" }, { text: "  " }] });
    // no headings, no body → guard emits a single empty paragraph
    expect(paras.length).toBe(1);
  });
});

describe("buildResumeDoc", () => {
  it("packs to a non-trivial DOCX byte string (selectable text, not empty)", async () => {
    const doc = buildResumeDoc(content);
    const b64 = await Packer.toBase64String(doc);
    expect(typeof b64).toBe("string");
    expect(b64.length).toBeGreaterThan(500); // a real .docx zip, not an empty stub
  });
});
