import { describe, it, expect } from "vitest";
import { buildMime, deliverEmail, emailEnabled } from "@/lib/email";

/**
 * Slice H2 (prepared) — the email seam. The FLAG-OFF path is the one in
 * production until the human flips CF Email, so it's the one tested hardest:
 * a no-op that reports honestly and can never throw.
 */
describe("buildMime", () => {
  it("builds a minimal RFC-shaped plain-text message", () => {
    const mime = buildMime({ to: "u@example.com", from: "ro@roleos.fyi", subject: "RO · your week", text: "Hi.\nBye." });
    expect(mime).toContain("From: ro@roleos.fyi\r\n");
    expect(mime).toContain("To: u@example.com\r\n");
    expect(mime).toContain("Subject: RO · your week\r\n");
    expect(mime.endsWith("\r\n\r\nHi.\nBye.")).toBe(true);
  });

  it("neutralizes header injection via the subject", () => {
    const mime = buildMime({
      to: "u@example.com",
      from: "ro@roleos.fyi",
      subject: "hi\r\nBcc: victim@example.com",
      text: "x",
    });
    expect(mime).not.toContain("\r\nBcc:"); // never a separate header line
    expect(mime).toContain("Subject: hi Bcc: victim@example.com"); // folded into subject text
  });
});

describe("emailEnabled", () => {
  it("requires BOTH the flag and a sender", () => {
    expect(emailEnabled({})).toBe(false);
    expect(emailEnabled({ EMAIL_DELIVERY_ENABLED: "1" })).toBe(false);
    expect(emailEnabled({ EMAIL_FROM: "ro@roleos.fyi" })).toBe(false);
    expect(emailEnabled({ EMAIL_DELIVERY_ENABLED: "1", EMAIL_FROM: "ro@roleos.fyi" })).toBe(true);
    expect(emailEnabled({ EMAIL_DELIVERY_ENABLED: "true", EMAIL_FROM: "ro@roleos.fyi" })).toBe(false); // exactly "1"
  });
});

describe("deliverEmail — flag off (the production state until go-live)", () => {
  it("no-ops honestly and never throws", async () => {
    const res = await deliverEmail({ to: "u@example.com", subject: "s", text: "t" });
    expect(res).toEqual({ delivered: false, reason: "flag_off" });
  });
});
