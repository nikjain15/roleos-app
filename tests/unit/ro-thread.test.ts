import { describe, it, expect } from "vitest";
import { overflowTurns, summarizePrompt, toConversation, MAX_TURNS, type Turn } from "@/lib/ro/thread";

/**
 * M2 — the conversation thread's PURE parts: bounding context (keep last-k
 * verbatim, fold the rest), the fold prompt, and the compact injection shape.
 */

const turn = (n: number): Turn => ({ q: `q${n}`, a: `a${n}` });

describe("overflowTurns — bounded context", () => {
  it("keeps everything when under the cap", () => {
    const turns = [turn(1), turn(2)];
    expect(overflowTurns(turns)).toEqual({ kept: turns, overflow: [] });
  });

  it("folds the oldest, keeps the last MAX_TURNS verbatim", () => {
    const turns = Array.from({ length: MAX_TURNS + 2 }, (_, i) => turn(i));
    const { kept, overflow } = overflowTurns(turns);
    expect(kept).toHaveLength(MAX_TURNS);
    expect(overflow).toHaveLength(2);
    expect(overflow.map((t) => t.q)).toEqual(["q0", "q1"]); // the oldest two
    expect(kept[kept.length - 1].q).toBe(`q${MAX_TURNS + 1}`); // newest kept
  });

  it("respects a custom cap", () => {
    expect(overflowTurns([turn(1), turn(2), turn(3)], 1).kept).toHaveLength(1);
  });
});

describe("summarizePrompt", () => {
  it("includes the prior summary and the overflow turns", () => {
    const { prompt } = summarizePrompt("prior context", [turn(1)]);
    expect(prompt).toContain("prior context");
    expect(prompt).toContain("Q: q1");
    expect(prompt).toContain("RO: a1");
  });
  it("handles an empty prior summary", () => {
    expect(summarizePrompt("", [turn(1)]).prompt).toContain("(none)");
  });
});

describe("toConversation — compact injection", () => {
  it("null when the thread is empty (nothing to inject)", () => {
    expect(toConversation({ surface: "dock", summary: "", turns: [] })).toBeNull();
  });
  it("carries summary + recent turns when present", () => {
    const c = toConversation({ surface: "dock", summary: "s", turns: [turn(1)] });
    expect(c).toEqual({ summary: "s", recent: [turn(1)] });
  });
});
