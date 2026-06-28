import { describe, it, expect } from "vitest";
import { normalizeProfileText } from "@/lib/normalize-profile";

// A LinkedIn "Save to PDF" export dump, with the boilerplate it actually carries:
// the name as a running header on every page, page numbers, dividers, a bare URL,
// empty section chrome, and blank-line sprawl.
const RAW = `Jane Doe
Page 1 of 3
————————————————
Contact
www.linkedin.com/in/janedoe


Senior Product Manager — 8 years, last 4 in AI/ML.
Led a 0-to-1 LLM assistant: cut response time 40%, deflected 30% of tickets.



Jane Doe
Page 2 of 3
Experience
Built a fraud-detection ML platform from scratch.
Top Skills
Jane Doe
Page 3 of 3`;

describe("normalizeProfileText · strips extraction noise (cuts tokens, keeps content)", () => {
  const cleaned = normalizeProfileText(RAW);

  it("drops page numbers, dividers, bare URLs, empty section chrome", () => {
    expect(cleaned).not.toMatch(/Page \d+ of \d+/);
    expect(cleaned).not.toMatch(/————/);
    expect(cleaned).not.toMatch(/www\.linkedin/);
    expect(cleaned).not.toMatch(/^Top Skills$/m);
  });

  it("drops the running-header name (repeated 3x) but keeps real content", () => {
    // 'Jane Doe' appears 3x as a header → removed
    expect(cleaned).not.toMatch(/Jane Doe/);
    // the substance survives intact
    expect(cleaned).toContain("Senior Product Manager");
    expect(cleaned).toContain("cut response time 40%");
    expect(cleaned).toContain("fraud-detection ML platform");
  });

  it("measurably shrinks the payload", () => {
    expect(cleaned.length).toBeLessThan(RAW.length * 0.7);
  });
});
