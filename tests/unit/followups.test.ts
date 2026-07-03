import { describe, it, expect } from "vitest";
import { suggestFollowups } from "@/lib/followups";

describe("suggestFollowups", () => {
  it("returns up to 3 generic follow-ups when roles were cited", () => {
    const f = suggestFollowups(undefined, true);
    expect(f.length).toBe(3);
    expect(f.every((s) => s.endsWith("?"))).toBe(true);
  });

  it("leads with company-scoped questions when scoped to a company", () => {
    const f = suggestFollowups({ company: "Stripe" }, true);
    expect(f[0]).toContain("Stripe");
  });

  it("excludes already-asked questions (case-insensitive)", () => {
    const asked = ["which roles sponsor visas?"];
    const f = suggestFollowups(undefined, true, asked);
    expect(f.map((s) => s.toLowerCase())).not.toContain("which roles sponsor visas?");
  });

  it("returns nothing to suggest when there are no roles and no scope", () => {
    expect(suggestFollowups(undefined, false)).toEqual([]);
  });
});
