import { describe, it, expect } from "vitest";
import { scanPrivacy } from "@/lib/privacy-scan";
import { inspectGuardrails, computeConfidence } from "@/agent/quality-gate";

/**
 * THE PII / PRIVACY SCAN (findings SH9 and A4).
 *
 * The defect was not that the scan was missing. It was that a MISSING scan was
 * being counted as a SATISFIED one. `runGuardrails` carried a comment saying the
 * privacy check was "stubbed honestly, not faked as passing", and then returned
 * `ok: true`; `computeConfidence` reads `guardrailsOk` as a hard gate that passed.
 * A draft leaking a third party's phone number could band `strong`.
 *
 * This file pins the three outcomes that replace it, and the fail-closed rule
 * that connects them: `clean` passes, `flagged` fails the guardrails, and
 * `indeterminate` (the scan could not be evaluated) is never counted as a pass.
 */

const OWN_PROFILE = [
  "ALEX MORGAN, Product Manager",
  "alex.morgan@example.com · +44 20 7946 0958 · London",
  "Led the billing migration for a 40-person platform team.",
  "Grew ARR 45% to $12.4M between 2019-2023 across 12 markets.",
].join("\n");

describe("privacy scan · the candidate's own details are expected, not a leak", () => {
  it("passes a résumé carrying the candidate's own email and phone", () => {
    const draft = "Alex Morgan, alex.morgan@example.com, +44 20 7946 0958. Led billing migration.";
    const r = scanPrivacy(draft, OWN_PROFILE);
    expect(r.status).toBe("clean");
    expect(r.failures).toEqual([]);
    // It still SAW them; it classified them, which is the point.
    expect(r.findings.map((f) => f.disposition)).toEqual(["own", "own"]);
  });

  it("matches the same number written in a different format", () => {
    const r = scanPrivacy("Reach me on +44-20-7946-0958.", OWN_PROFILE);
    expect(r.status).toBe("clean");
  });

  it("does not mistake résumé metrics and date ranges for phone numbers", () => {
    const draft =
      "Grew ARR 45% to $12.4M between 2019-2023. Cut p99 latency from 1,240ms to 180ms across 12 markets.";
    const r = scanPrivacy(draft, OWN_PROFILE);
    expect(r.status).toBe("clean");
    expect(r.findings).toEqual([]);
  });
});

describe("privacy scan · third-party personal data fails the gate", () => {
  it("flags an email that is not the candidate's own", () => {
    const r = scanPrivacy(
      "Referee: Priya Raman, priya.raman@northwind.example, happy to speak to you.",
      OWN_PROFILE,
    );
    expect(r.status).toBe("flagged");
    expect(r.findings[0].disposition).toBe("third_party");
    expect(r.failures[0]).toContain("does not appear in the candidate's own profile");
  });

  it("flags a phone number that is not the candidate's own", () => {
    const r = scanPrivacy("Call my old manager on +1 (415) 555-0142.", OWN_PROFILE);
    expect(r.status).toBe("flagged");
    expect(r.findings.some((f) => f.category === "phone" && f.disposition === "third_party")).toBe(
      true,
    );
  });

  it("redacts the value in the failure message, because the log is not a place for PII", () => {
    const r = scanPrivacy("Contact priya.raman@northwind.example.", OWN_PROFILE);
    expect(r.failures.join(" ")).not.toContain("priya.raman@northwind.example");
    expect(r.findings[0].redacted).toBe("pr***@northwind.example");
  });
});

describe("privacy scan · categories RO must never emit, ground truth or not", () => {
  it("fails on a payment card even when the candidate pasted it themselves", () => {
    // Luhn-valid test number. Present in the ground truth AND still refused.
    const withCard = `${OWN_PROFILE}\nCard on file: 4242 4242 4242 4242`;
    const r = scanPrivacy("Invoice to card 4242 4242 4242 4242.", withCard);
    expect(r.status).toBe("flagged");
    expect(r.findings[0].disposition).toBe("never_emit");
    expect(r.failures[0]).toContain("RO never emits these");
  });

  it("ignores a long digit run that is not a valid card", () => {
    const r = scanPrivacy("Order reference 1234 5678 9012 3456 shipped.", OWN_PROFILE);
    expect(r.findings.some((f) => f.category === "payment_card")).toBe(false);
  });

  it("fails on a national identifier", () => {
    const r = scanPrivacy("SSN 123-45-6789 for the background check.", OWN_PROFILE);
    expect(r.status).toBe("flagged");
    expect(r.findings.some((f) => f.category === "national_id")).toBe(true);
  });

  it("fails on a bank account (IBAN)", () => {
    const r = scanPrivacy("Pay to GB29NWBK60161331926819.", OWN_PROFILE);
    expect(r.status).toBe("flagged");
    expect(r.findings.some((f) => f.category === "bank_account")).toBe(true);
  });
});

describe("privacy scan · fail closed when it cannot be evaluated", () => {
  it("returns indeterminate, never clean, when there is no ground truth to compare against", () => {
    const r = scanPrivacy("Drop me a line at someone@example.com.");
    expect(r.status).toBe("indeterminate");
    expect(r.groundTruthAvailable).toBe(false);
    expect(r.findings[0].disposition).toBe("unclassified");
  });

  it("is still genuinely clean when the output contains no personal data at all", () => {
    // An honest clean does not need a ground truth: nothing was found to classify.
    const r = scanPrivacy("Here are three roles worth a look this week.");
    expect(r.status).toBe("clean");
  });

  it("an indeterminate scan can never be graded a `strong` pass", () => {
    const clean = {
      shapeOk: true,
      guardrailsOk: true,
      criticPass: true,
      criticReasons: 0,
      truthOk: true,
      truthViolations: 0,
      revised: false,
      groundingChars: 5000,
    };
    expect(computeConfidence(clean).band).toBe("strong");
    // This is the exact substitution the old stub made invisible.
    expect(computeConfidence({ ...clean, privacyIndeterminate: true }).band).toBe("weak");
  });
});

describe("quality gate · the guardrail pass now carries the privacy verdict", () => {
  it("fails the guardrails on third-party PII, so confidence floors to unknown", () => {
    const g = inspectGuardrails("Speak to priya.raman@northwind.example about Alex.", OWN_PROFILE);
    expect(g.ok).toBe(false);
    expect(g.privacy.status).toBe("flagged");
    expect(
      computeConfidence({
        shapeOk: true,
        guardrailsOk: g.ok,
        criticPass: true,
        criticReasons: 0,
        truthOk: true,
        truthViolations: 0,
        revised: false,
        groundingChars: 5000,
      }).band,
    ).toBe("unknown");
  });

  it("reports the privacy verdict on a clean pass too, so it is never merely assumed", () => {
    const g = inspectGuardrails("Three roles worth a look this week.", OWN_PROFILE);
    expect(g.ok).toBe(true);
    expect(g.privacy.status).toBe("clean");
  });

  it("still enforces the no-send and voice guardrails alongside it", () => {
    expect(inspectGuardrails("I have sent your application.").ok).toBe(false);
    expect(inspectGuardrails("Act now or don't fall behind.").ok).toBe(false);
  });
});
