import { describe, it, expect } from "vitest";
import { tierForDistance, toScoredVerdict, type DistanceAnchors } from "@/lib/explore-fit";

/**
 * Fit-on-browse (slice W1, roles-workspace P0-7) — the pure tiering logic.
 * Anchors are the USER's own p10/p35 corpus distances (calibration 2026-07-03:
 * a senior AI PM profile sits ~0.187–0.355 across the corpus, a non-tech profile
 * ~0.33–0.47 — absolute cutoffs would misread both, hence relative anchors).
 */
describe("tierForDistance — relative to the user's own distribution", () => {
  const anchors: DistanceAnchors = { d10: 0.231, d35: 0.275 };

  it("nearest decile is a strong signal (inclusive boundary)", () => {
    expect(tierForDistance(0.15, anchors)).toBe("strong");
    expect(tierForDistance(0.231, anchors)).toBe("strong");
  });

  it("the next band is worth a look (inclusive boundary)", () => {
    expect(tierForDistance(0.232, anchors)).toBe("look");
    expect(tierForDistance(0.275, anchors)).toBe("look");
  });

  it("the long tail is honestly weak", () => {
    expect(tierForDistance(0.276, anchors)).toBe("weak");
    expect(tierForDistance(0.9, anchors)).toBe("weak");
  });

  it("adapts per user — the same distance reads differently for different profiles", () => {
    const nonTech: DistanceAnchors = { d10: 0.361, d35: 0.395 };
    expect(tierForDistance(0.3, anchors)).toBe("weak"); // far tail for the close-fit user
    expect(tierForDistance(0.3, nonTech)).toBe("strong"); // nearest decile for the far user
  });

  it("degenerate anchors (d10 === d35, e.g. tiny corpus) still partition sanely", () => {
    const flat: DistanceAnchors = { d10: 0.3, d35: 0.3 };
    expect(tierForDistance(0.29, flat)).toBe("strong");
    expect(tierForDistance(0.3, flat)).toBe("strong");
    expect(tierForDistance(0.31, flat)).toBe("weak");
  });
});

describe("toScoredVerdict — stored recommendation → badge verdict", () => {
  it("maps pursue/strong variants", () => {
    expect(toScoredVerdict("pursue")).toBe("pursue");
    expect(toScoredVerdict("Strong fit — pursue now")).toBe("pursue");
  });
  it("maps skip/pass variants", () => {
    expect(toScoredVerdict("skip")).toBe("skip");
    expect(toScoredVerdict("Pass on this one")).toBe("skip");
  });
  it("defaults to maybe for unknown or null", () => {
    expect(toScoredVerdict("worth considering")).toBe("maybe");
    expect(toScoredVerdict(null)).toBe("maybe");
    expect(toScoredVerdict("")).toBe("maybe");
  });
});
