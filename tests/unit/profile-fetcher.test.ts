import { describe, it, expect } from "vitest";
import { extractLinkedInUrl, getProfileFetcher } from "@/lib/profile-fetcher";

describe("profile-fetcher · URL detection + off-by-default", () => {
  it("extracts a LinkedIn /in/ profile URL from text", () => {
    expect(extractLinkedInUrl("https://www.linkedin.com/in/niktechnologist/")).toBe(
      "https://www.linkedin.com/in/niktechnologist",
    );
    expect(extractLinkedInUrl("see https://linkedin.com/in/jane-doe?x=1 for more")).toBe(
      "https://linkedin.com/in/jane-doe",
    );
    expect(extractLinkedInUrl("https://uk.linkedin.com/in/someone")).toBe(
      "https://uk.linkedin.com/in/someone",
    );
  });

  it("returns null when there's no LinkedIn profile URL", () => {
    expect(extractLinkedInUrl("just some text about my work")).toBeNull();
    expect(extractLinkedInUrl("https://example.com/in/notlinkedin")).toBeNull();
  });

  it("is OFF by default — no provider key configured means no fetcher", () => {
    // No APIFY_TOKEN / BRIGHTDATA_TOKEN in the test env → feature disabled.
    expect(getProfileFetcher()).toBeNull();
  });
});
