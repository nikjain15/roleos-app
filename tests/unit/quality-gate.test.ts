import { describe, it, expect } from "vitest";
import {
  inspectGuardrails,
  computeConfidence,
  GROUNDING_MIN_CHARS,
  type ConfidenceSignals,
} from "@/agent/quality-gate";

// A clean, fully-passing signal set. Individual tests override single fields.
function cleanSignals(over: Partial<ConfidenceSignals> = {}): ConfidenceSignals {
  return {
    shapeOk: true,
    guardrailsOk: true,
    criticPass: true,
    criticReasons: 0,
    truthOk: true,
    truthViolations: 0,
    revised: false,
    groundingChars: GROUNDING_MIN_CHARS + 100, // ample grounding
    ...over,
  };
}

describe("quality gate · deterministic guardrails", () => {
  it("passes clean, on-voice copy", () => {
    const r = inspectGuardrails(
      "Send your Stripe application — strongest fit this week. I'd do it today.",
    );
    expect(r.ok).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("blocks toxic positivity", () => {
    const r = inspectGuardrails("Don't worry — everything happens for a reason.");
    expect(r.ok).toBe(false);
  });

  it("blocks manufactured urgency and guilt", () => {
    expect(inspectGuardrails("ACT NOW — 3 roles closing!").ok).toBe(false);
    expect(inspectGuardrails("You haven't logged in for 14 days.").ok).toBe(false);
  });

  it("blocks emoji-spam / hype", () => {
    expect(inspectGuardrails("Offer incoming 🚀🔥").ok).toBe(false);
    expect(inspectGuardrails("The #1 AI job platform").ok).toBe(false);
  });

  it("blocks a false outbound claim (no-send marker)", () => {
    expect(inspectGuardrails("Done — I sent your application to Stripe.").ok).toBe(false);
  });
});

describe("quality gate · computed confidence", () => {
  it("is STRONG on a clean pass (all signals green, ample grounding)", () => {
    const c = computeConfidence(cleanSignals());
    expect(c.band).toBe("strong");
    expect(c.score).toBeGreaterThanOrEqual(0.8);
  });

  it("is STRONG on a clean pass with no ground truth (grounding not applicable)", () => {
    expect(computeConfidence(cleanSignals({ groundingChars: null })).band).toBe("strong");
  });

  it("is WEAK when the critic passes but the grounding slice is thin", () => {
    const c = computeConfidence(cleanSignals({ groundingChars: 50 }));
    expect(c.band).toBe("weak");
    expect(c.score).toBeGreaterThanOrEqual(0.45);
    expect(c.score).toBeLessThan(0.8);
  });

  it("is WEAK on a borderline pass that needed a revise", () => {
    expect(computeConfidence(cleanSignals({ revised: true })).band).toBe("weak");
  });

  it("is UNKNOWN when a hard gate fails (shape, guardrails, critic, or truth)", () => {
    expect(computeConfidence(cleanSignals({ shapeOk: false })).band).toBe("unknown");
    expect(computeConfidence(cleanSignals({ guardrailsOk: false })).band).toBe("unknown");
    expect(computeConfidence(cleanSignals({ criticPass: false })).band).toBe("unknown");
    expect(computeConfidence(cleanSignals({ truthOk: false })).band).toBe("unknown");
  });

  it("all three bands are reachable from the same signal shape", () => {
    const bands = new Set([
      computeConfidence(cleanSignals()).band, // strong
      computeConfidence(cleanSignals({ groundingChars: 10 })).band, // weak
      computeConfidence(cleanSignals({ shapeOk: false })).band, // unknown
    ]);
    expect(bands).toEqual(new Set(["strong", "weak", "unknown"]));
  });

  it("compounding soft concerns drive a pass down to unknown (fail-closed floor)", () => {
    // thin grounding + revise + critic caveats + truth caveats all at once.
    const c = computeConfidence(
      cleanSignals({ groundingChars: 10, revised: true, criticReasons: 2, truthViolations: 1 }),
    );
    expect(c.score).toBeLessThan(0.45);
    expect(c.band).toBe("unknown");
  });
});
