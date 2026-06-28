import { describe, it, expect } from "vitest";
import { assessProfileInput } from "@/lib/profile-input";

describe("profile input · honesty guard (no matching on noise)", () => {
  it("rejects a bare LinkedIn URL — nothing real to match on", () => {
    const a = assessProfileInput("https://www.linkedin.com/in/niktechnologist/");
    expect(a.ok).toBe(false);
    expect(a.hadUrl).toBe(true);
    expect(a.realWords).toBeLessThan(3);
  });

  it("rejects a URL with a couple of filler words", () => {
    const a = assessProfileInput("here is my profile https://www.linkedin.com/in/someone/");
    expect(a.ok).toBe(false);
  });

  it("accepts a real few-line description", () => {
    const a = assessProfileInput(
      "Senior PM, 8 years, last 4 on AI products. Led a 0-to-1 LLM assistant launch and a fraud ML platform. Want senior AI PM roles in SF.",
    );
    expect(a.ok).toBe(true);
    expect(a.realWords).toBeGreaterThanOrEqual(12);
  });

  it("counts real words even when a URL is included alongside real content", () => {
    const a = assessProfileInput(
      "I'm a staff product manager focused on machine learning platforms and developer tools, see https://example.com/me for more detail and context.",
    );
    expect(a.ok).toBe(true);
    expect(a.hadUrl).toBe(true);
  });
});
