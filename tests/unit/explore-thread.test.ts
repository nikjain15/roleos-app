import { describe, it, expect } from "vitest";
import { parseThread, serializeThread, THREAD_MAX_TURNS, type AskTurn } from "@/lib/explore-thread";

/**
 * Slice W6 — anon Explore thread persistence. The storage format is untrusted
 * input (any extension or user can write localStorage): parsing must never
 * crash, never admit non-strings, and always cap.
 */
const turn = (i: number): AskTurn => ({
  q: `question ${i}`,
  a: `answer ${i}`,
  cited: [{ id: `id-${i}`, company: "Acme", role_title: "PM" }],
  followups: ["next?"],
});

describe("parseThread", () => {
  it("round-trips a real thread", () => {
    const t = [turn(1), turn(2)];
    expect(parseThread(serializeThread(t))).toEqual(t);
  });

  it("never crashes on garbage — junk, non-JSON, wrong shapes, null", () => {
    expect(parseThread(null)).toEqual([]);
    expect(parseThread("")).toEqual([]);
    expect(parseThread("not json {{{")).toEqual([]);
    expect(parseThread('{"an":"object"}')).toEqual([]);
    expect(parseThread('[{"q":123,"a":true},{"no":"fields"},null,42]')).toEqual([]);
  });

  it("drops malformed turns but keeps valid ones; scrubs non-string cited/followups", () => {
    const raw = JSON.stringify([
      { q: "ok", a: "fine", cited: [{ id: 1 }, { id: "x", company: "C", role_title: "T" }], followups: [null, "real", 7] },
      { q: "", a: "no question" },
    ]);
    const parsed = parseThread(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].cited).toEqual([{ id: "x", company: "C", role_title: "T" }]);
    expect(parsed[0].followups).toEqual(["real"]);
  });

  it("caps to the newest turns and truncates oversized strings", () => {
    const many = Array.from({ length: 30 }, (_, i) => turn(i));
    const parsed = parseThread(serializeThread(many));
    expect(parsed).toHaveLength(THREAD_MAX_TURNS);
    expect(parsed[parsed.length - 1].q).toBe("question 29");

    const huge = parseThread(JSON.stringify([{ q: "x".repeat(9000), a: "y".repeat(9000) }]));
    expect(huge[0].q.length).toBeLessThanOrEqual(500);
    expect(huge[0].a.length).toBeLessThanOrEqual(8000);
  });
});
