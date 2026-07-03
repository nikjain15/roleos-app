import { describe, it, expect } from "vitest";
import { mapFlags } from "@/lib/resume/flags";

const bullets = [
  { text: "Led a team of 40 engineers to ship a payments platform processing $2B annually." },
  { text: "Improved onboarding conversion by rewriting the activation flow." },
  { text: "Managed vendor relationships across three regions." },
];

describe("mapFlags", () => {
  it("returns grounded when there are no violations", () => {
    const m = mapFlags(bullets, []);
    expect(m.grounded).toBe(true);
    expect(m.outstanding).toBe(0);
    expect(m.byBullet).toEqual([]);
  });

  it("maps a violation to the bullet it most overlaps with", () => {
    const m = mapFlags(bullets, ["Claim of leading 40 engineers and $2B payments overstates scope"]);
    expect(m.grounded).toBe(false);
    expect(m.outstanding).toBe(1);
    expect(m.byBullet).toHaveLength(1);
    expect(m.byBullet[0].bulletIndex).toBe(0);
    expect(m.byBullet[0].reasons).toHaveLength(1);
  });

  it("puts an unmatchable violation at document level", () => {
    const m = mapFlags(bullets, ["The overall seniority framing exceeds the profile"]);
    expect(m.documentLevel.length + m.byBullet.length).toBeGreaterThan(0);
    // no strong single-bullet overlap → document level
    expect(m.documentLevel).toContain("The overall seniority framing exceeds the profile");
  });

  it("excludes resolved violations from the live status", () => {
    const v = "Claim of leading 40 engineers and $2B payments overstates scope";
    const m = mapFlags(bullets, [v], [v]);
    expect(m.grounded).toBe(true);
    expect(m.outstanding).toBe(0);
    expect(m.byBullet).toEqual([]);
  });

  it("handles multiple violations across bullets", () => {
    const m = mapFlags(bullets, [
      "leading 40 engineers on the payments platform overstates the real scope",
      "vendor relationships across three regions is not supported by the profile",
    ]);
    expect(m.outstanding).toBe(2);
    const idxs = m.byBullet.map((b) => b.bulletIndex).sort();
    expect(idxs).toContain(0);
    expect(idxs).toContain(2);
  });
});
