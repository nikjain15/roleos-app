import { describe, it, expect } from "vitest";
import { normalizeJobUrl, isLinkedInJobUrl } from "@/lib/user-roles";

describe("normalizeJobUrl", () => {
  it("canonicalizes a LinkedIn job view URL, stripping tracking params", () => {
    expect(
      normalizeJobUrl(
        "https://www.linkedin.com/jobs/view/4012345678/?refId=abc&trackingId=xyz&utm_source=feed",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/4012345678/");
  });

  it("handles slugged job view URLs (title-in-path form)", () => {
    expect(
      normalizeJobUrl("https://www.linkedin.com/jobs/view/senior-product-manager-at-acme-4012345678"),
    ).toBe("https://www.linkedin.com/jobs/view/4012345678/");
  });

  it("extracts currentJobId from a search-page URL", () => {
    expect(
      normalizeJobUrl("https://www.linkedin.com/jobs/search/?currentJobId=987654321&keywords=pm"),
    ).toBe("https://www.linkedin.com/jobs/view/987654321/");
  });

  it("defaults the scheme when people paste without one", () => {
    expect(normalizeJobUrl("linkedin.com/jobs/view/123456")).toBe(
      "https://www.linkedin.com/jobs/view/123456/",
    );
  });

  it("passes non-LinkedIn http(s) URLs through", () => {
    expect(normalizeJobUrl("https://jobs.acme.com/postings/42")).toBe("https://jobs.acme.com/postings/42");
  });

  it("rejects garbage and non-web schemes", () => {
    expect(normalizeJobUrl("")).toBeNull();
    expect(normalizeJobUrl("   ")).toBeNull();
    expect(normalizeJobUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeJobUrl("not a url at all")).toBeNull();
  });

  it("dedupes: the same posting pasted two ways normalizes identically", () => {
    const a = normalizeJobUrl("linkedin.com/jobs/view/555000111?refId=zz");
    const b = normalizeJobUrl("https://www.linkedin.com/jobs/view/pm-at-acme-555000111/");
    expect(a).toBe(b);
  });
});

describe("isLinkedInJobUrl", () => {
  it("recognizes canonical LinkedIn job URLs only", () => {
    expect(isLinkedInJobUrl("https://www.linkedin.com/jobs/view/123/")).toBe(true);
    expect(isLinkedInJobUrl("https://jobs.acme.com/postings/42")).toBe(false);
    expect(isLinkedInJobUrl(null)).toBe(false);
  });
});
