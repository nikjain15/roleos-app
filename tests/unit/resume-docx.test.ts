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

  it("renders experience SECTIONS: an Experience heading + one header per block + its bullets", () => {
    const paras = resumeParagraphs({
      summary: "s",
      experience: [
        { company: "Acme", title: "PM", dates: "2019–2022", lines: [{ text: "Led ML platform" }, { text: "Grew rev 3x" }] },
        { company: "Globex", title: "Product", lines: [{ text: "Shipped LLM assistant" }, { text: "  " }] },
      ],
      keywords_injected: ["llm"],
    });
    // Summary heading + body (2) + Experience heading (1) + [Acme header + 2 bullets] (3)
    // + [Globex header + 1 non-empty bullet] (2) + Skills heading + body (2) = 10
    expect(paras.length).toBe(10);
  });

  it("prefers sections over legacy bullets when both are present", () => {
    const paras = resumeParagraphs({
      experience: [{ company: "Acme", title: "PM", lines: [{ text: "one line" }] }],
      bullets: [{ text: "legacy a" }, { text: "legacy b" }],
    });
    // Experience heading + Acme header + 1 bullet = 3 (legacy bullets ignored)
    expect(paras.length).toBe(3);
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
