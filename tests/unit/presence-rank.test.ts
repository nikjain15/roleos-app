import { describe, expect, it } from "vitest";
import {
  ageHours, contentHash, rank, rejectReason, scoreItem,
  DEFAULT_RANK_CONFIG, type PresenceItem,
} from "@/lib/presence/rank";

/**
 * The ranker is a port of the proven local pipeline
 * (nik-jain-jobos/social/signals/lib/rank.mjs). Each case below encodes a
 * defect found by looking at real output on the 2026-08-11 live runs — the
 * point of the tests is that the port keeps those lessons.
 */

const NOW = Date.parse("2026-08-11T12:00:00Z");

function item(over: Partial<PresenceItem>): PresenceItem {
  return {
    platform: "linkedin",
    source_id: "s1",
    url: "https://example.test/post",
    author: "Someone",
    author_headline: null,
    title: null,
    body: "A post about agent evals and guardrails in regulated systems.",
    posted_at: new Date(NOW - 3 * 36e5).toISOString(),
    engagement: 84,
    ...over,
  };
}

describe("presence rank", () => {
  it("keeps a practitioner post in the reachable window and scores the intersection", () => {
    const { score, hits } = scoreItem(item({
      body: "Our agent evals passed at 94% but the review queue kept sending correct output back. How are people measuring approval, not accuracy?",
    }));
    expect(hits).toContain("reachable");
    expect(hits).toContain("evals");
    expect(hits).toContain("approval");
    expect(score).toBeGreaterThanOrEqual(DEFAULT_RANK_CONFIG.min_score);
  });

  it("rejects a job posting only at two or more markers (a real post may say 'years of experience')", () => {
    const twoMarkers = item({
      body: "We're hiring an AI PM. 8+ years experience with LLM evals required. Share your resume.",
    });
    expect(rejectReason(twoMarkers, DEFAULT_RANK_CONFIG, NOW)).toMatch(/^job-posting:/);

    const oneMarker = item({
      body: "After 10+ years of experience shipping evals, my rule: measure the reviewer, not the model.",
    });
    expect(rejectReason(oneMarker, DEFAULT_RANK_CONFIG, NOW)).toBeNull();
  });

  it("rejects a product launch at two promo markers (the crypto-launch lesson)", () => {
    const launch = item({
      body: "Introducing AgentEval Pro, now generally available. Sign up for the waitlist and book a demo of our platform for LLM evals.",
    });
    expect(rejectReason(launch, DEFAULT_RANK_CONFIG, NOW)).toMatch(/^promo:/);
  });

  it("drops cross-posted duplicates on content hash, not URL (the recruiter-top-three lesson)", () => {
    const a = item({ url: "https://example.test/a" });
    const b = item({ url: "https://example.test/b" });
    expect(contentHash(a)).toBe(contentHash(b));
    const { kept, dropped } = rank([a, b], DEFAULT_RANK_CONFIG, NOW);
    expect(kept).toHaveLength(1);
    expect(dropped.map((d) => d.reason)).toContain("duplicate-content");
  });

  it("clamps a small negative age to 0 and treats a large one as unknown (timezone artifact)", () => {
    expect(ageHours(item({ posted_at: new Date(NOW + 5 * 36e5).toISOString() }), NOW)).toBe(0);
    expect(ageHours(item({ posted_at: new Date(NOW + 20 * 36e5).toISOString() }), NOW)).toBeNull();
  });

  it("never rejects on unknown engagement, only on a known-too-large number", () => {
    expect(rejectReason(item({ engagement: null }), DEFAULT_RANK_CONFIG, NOW)).toBeNull();
    expect(rejectReason(item({ engagement: 1676 }), DEFAULT_RANK_CONFIG, NOW)).toBe("too-big:1676");
  });

  it("rejects zero-engagement posts only after the dead-after window", () => {
    const fresh = item({ engagement: 0, posted_at: new Date(NOW - 2 * 36e5).toISOString() });
    expect(rejectReason(fresh, DEFAULT_RANK_CONFIG, NOW)).toBeNull();
    const dead = item({ engagement: 0, posted_at: new Date(NOW - 20 * 36e5).toISOString() });
    expect(rejectReason(dead, DEFAULT_RANK_CONFIG, NOW)).toBe("no-engagement");
  });

  it("excludes tier-C noise (certifications, bootcamps, prop-firm jargon)", () => {
    expect(rejectReason(item({ body: "Enroll now in our LLM evals certification bootcamp, 40% off!" }), DEFAULT_RANK_CONFIG, NOW))
      .toMatch(/^excluded:/);
    expect(rejectReason(item({ body: "Passed my prop firm eval, payout incoming" }), DEFAULT_RANK_CONFIG, NOW))
      .toMatch(/^excluded:/);
  });

  it("ranks by score then freshness, and drops low scores with the reason recorded", () => {
    const strong = item({
      url: "https://example.test/strong",
      body: "Shipped a detector at 0.83 precision on purpose; recall mattered more. Parity run against the rules engine, compliance signed off.",
    });
    const weak = item({ url: "https://example.test/weak", body: "AI agents are interesting.", engagement: 2 });
    const { kept, dropped } = rank([weak, strong], DEFAULT_RANK_CONFIG, NOW);
    expect(kept[0]?.url).toBe("https://example.test/strong");
    expect(dropped.some((d) => d.reason.startsWith("low-score:"))).toBe(true);
  });
});
