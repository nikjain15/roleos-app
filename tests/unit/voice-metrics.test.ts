import { describe, it, expect } from "vitest";
import {
  fillerCount,
  wordCount,
  wordsPerMinute,
  deliveryNotes,
  RAMBLE_WORDS,
  type CandidateTurn,
} from "@/lib/voice-metrics";

/**
 * X8 — delivery metrics, pure and transcript-grounded. Every note must trace
 * to countable evidence; the copy stays gains-oriented (a coach, not a judge).
 */

describe("fillerCount / wordCount / wordsPerMinute", () => {
  it("counts fillers on word boundaries, case-insensitive", () => {
    expect(fillerCount("Um, I think, uh, we basically shipped it, you know")).toBe(4);
    expect(fillerCount("The umbrella likes Ukulele")).toBe(0); // no substring hits
    expect(fillerCount("")).toBe(0);
  });

  it("words and pace behave on edges", () => {
    expect(wordCount("  one   two  ")).toBe(2);
    expect(wordCount("")).toBe(0);
    expect(wordsPerMinute(150, 60_000)).toBe(150);
    expect(wordsPerMinute(150, 1_000)).toBeNull(); // too short to trust
    expect(wordsPerMinute(0, 60_000)).toBeNull();
    expect(wordsPerMinute(150, undefined)).toBeNull(); // typed answer — untimed
  });
});

describe("deliveryNotes", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

  it("empty or answerless transcript → no notes, no fabrication", () => {
    expect(deliveryNotes([])).toEqual([]);
    expect(deliveryNotes([{ text: "   " }])).toEqual([]);
  });

  it("names filler density with its evidence", () => {
    const turns: CandidateTurn[] = [
      { text: "Um, like, basically we, you know, sort of shipped it" },
      { text: "Uh, actually it was, like, basically fine" },
    ];
    const notes = deliveryNotes(turns);
    expect(notes.some((n) => n.includes("Fillers"))).toBe(true);
    expect(notes.some((n) => /per answer/.test(n))).toBe(true);
  });

  it("flags rambles past the threshold, with the count", () => {
    const notes = deliveryNotes([{ text: words(RAMBLE_WORDS + 20) }, { text: words(80) }]);
    expect(notes.some((n) => n.includes("1 answer ran past"))).toBe(true);
  });

  it("thin answers only flagged when they dominate", () => {
    const thinHeavy = deliveryNotes([{ text: words(10) }, { text: words(12) }, { text: words(120) }]);
    expect(thinHeavy.some((n) => n.includes("under"))).toBe(true);
    const oneThin = deliveryNotes([{ text: words(10) }, { text: words(120) }, { text: words(140) }, { text: words(90) }]);
    expect(oneThin.some((n) => n.includes("under"))).toBe(false);
  });

  it("pace notes only with ≥2 timed answers; clean runs get one honest positive", () => {
    const fast: CandidateTurn[] = [
      { text: words(200), durationMs: 60_000 },
      { text: words(210), durationMs: 60_000 },
    ];
    expect(deliveryNotes(fast).some((n) => n.includes("words/min"))).toBe(true);

    const clean = deliveryNotes([{ text: words(120) }, { text: words(100) }]);
    expect(clean).toHaveLength(1);
    expect(clean[0]).toContain("read clean");
  });

  it("never shames — no 'bad', 'terrible', 'failure' in any note", () => {
    const everything: CandidateTurn[] = [
      { text: "um uh like basically " + words(RAMBLE_WORDS + 10), durationMs: 40_000 },
      { text: "um you know " + words(10), durationMs: 5_000 },
    ];
    for (const n of deliveryNotes(everything)) {
      expect(/\b(bad|terrible|awful|failure|weak|embarrassing)\b/i.test(n)).toBe(false);
    }
  });
});
