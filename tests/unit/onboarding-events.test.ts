import { describe, it, expect } from "vitest";
import { onboardingEvents, type OnboardingActions } from "@/lib/onboarding-events";

const full: OnboardingActions = {
  target: "Senior AI PM, $220k+, SF or remote",
  scanned: 1536,
  savedMatches: 4,
  reranked: true,
  mirrorReactions: [
    { statement: "You're a technical PM who ships AI products", verdict: "confirm" },
    { statement: "You want to stay IC, not manage", verdict: "correct", correction: "actually open to managing" },
    { statement: "You're aiming for Staff-level comp", verdict: "correct", correction: "Director", isGuess: true },
    { statement: "  ", verdict: "confirm" }, // empty statement dropped
    { statement: "no-signal correction", verdict: "correct", correction: "   " }, // empty correction dropped
  ],
};

describe("onboardingEvents", () => {
  it("always emits the onboarding view row with provenance", () => {
    const rows = onboardingEvents({ scanned: 557, savedMatches: 3 });
    expect(rows[0]).toMatchObject({ kind: "onboarding", action: "view", weight: 1 });
    expect(rows[0].payload).toMatchObject({ scanned: 557, saved_matches: 3 });
  });

  it("captures the target as a high-weight correction", () => {
    const rows = onboardingEvents({ target: "Senior AI PM" });
    const t = rows.find((r) => (r.payload as { field?: string }).field === "target");
    expect(t).toMatchObject({ kind: "onboarding", action: "correct", weight: 3 });
    expect((t!.payload as { value: string }).value).toBe("Senior AI PM");
  });

  it("weights corrections (3) above confirmations (1)", () => {
    const rows = onboardingEvents(full);
    const confirm = rows.find((r) => r.kind === "mirror" && r.action === "approve");
    const correct = rows.find((r) => r.kind === "mirror" && r.action === "correct");
    expect(confirm!.weight).toBe(1);
    expect(correct!.weight).toBe(3);
  });

  it("drops empty statements and empty corrections (no fake signal)", () => {
    const rows = onboardingEvents(full);
    const mirror = rows.filter((r) => r.kind === "mirror");
    // 1 confirm + 2 real corrections = 3 (the blank statement + blank correction are dropped)
    expect(mirror).toHaveLength(3);
  });

  it("marks the target-guess correction and records a re-rank edit", () => {
    const rows = onboardingEvents(full);
    const guess = rows.find((r) => r.kind === "mirror" && (r.payload as { is_guess?: boolean }).is_guess);
    expect(guess).toMatchObject({ action: "correct" });
    const rerank = rows.find((r) => r.kind === "match" && r.action === "edit");
    expect(rerank).toMatchObject({ weight: 2 });
    expect((rerank!.payload as { rerank: boolean }).rerank).toBe(true);
  });

  it("is deterministic — same input yields identical rows (retry-safe)", () => {
    expect(onboardingEvents(full)).toEqual(onboardingEvents(full));
  });

  it("only allowed action verbs are used (append-only schema check)", () => {
    const allowed = new Set(["send", "skip", "edit", "reject", "correct", "approve", "view"]);
    for (const r of onboardingEvents(full)) expect(allowed.has(r.action)).toBe(true);
  });
});
