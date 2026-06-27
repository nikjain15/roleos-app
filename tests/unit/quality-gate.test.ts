import { describe, it, expect } from "vitest";
import { inspectGuardrails } from "@/agent/quality-gate";

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
