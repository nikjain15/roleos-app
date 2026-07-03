import { describe, it, expect } from "vitest";
import { buildApplyBundle, gmailComposeUrl } from "@/lib/apply";

describe("gmailComposeUrl", () => {
  it("builds a Gmail compose deep-link with encoded fields", () => {
    const u = gmailComposeUrl("a@b.com", "Hi & bye", "line1\nline2");
    expect(u).toContain("https://mail.google.com/mail/");
    expect(u).toContain("to=a%40b.com");
    expect(u).toContain("su=Hi+%26+bye");
    expect(u).toContain("view=cm");
  });
});

describe("buildApplyBundle", () => {
  const resume = {
    summary: "Senior PM with a payments background.",
    bullets: [{ text: "Shipped billing platform." }, { text: "Cut churn 12%." }, { text: "Led a team of 8." }, { text: "extra" }],
  };
  const role = { company: "Acme", role_title: "Staff PM", url: "https://acme.com/jobs/1" };

  it("composes a subject, note, and compose URLs from the real résumé", () => {
    const b = buildApplyBundle(resume, role, "Alex");
    expect(b.subject).toBe("Application — Staff PM at Acme");
    expect(b.note).toContain("Staff PM at Acme");
    expect(b.note).toContain("Senior PM with a payments background.");
    expect(b.note).toContain("• Shipped billing platform.");
    expect(b.note).toContain("Best,\nAlex");
    expect(b.atsUrl).toBe("https://acme.com/jobs/1");
    expect(b.gmailUrl).toContain("mail.google.com");
    expect(b.mailtoUrl.startsWith("mailto:?")).toBe(true);
  });

  it("caps highlights at 3 bullets", () => {
    const b = buildApplyBundle(resume, role);
    expect((b.note.match(/•/g) ?? []).length).toBe(3);
  });

  it("degrades gracefully with missing role fields (no ATS url)", () => {
    const b = buildApplyBundle({ summary: "x" }, {});
    expect(b.subject).toContain("the role");
    expect(b.atsUrl).toBeNull();
    expect(b.gmailUrl).toContain("mail.google.com");
  });

  // Slice W2 — an approved drafted cover letter replaces the template wholesale.
  it("uses the approved cover letter (body + subject) instead of the template", () => {
    const cover = { subject: "Staff PM — Alex for Acme", body: "Dear Acme team,\n\nA real letter.\n\nBest,\nAlex" };
    const b = buildApplyBundle(resume, role, "Alex", cover);
    expect(b.subject).toBe("Staff PM — Alex for Acme");
    expect(b.note).toBe(cover.body);
    expect(b.note).not.toContain("A few things I'd bring");
    expect(b.gmailUrl).toContain(encodeURIComponent("A real letter.").replace(/%20/g, "+").slice(0, 6));
    expect(b.mailtoUrl).toContain(encodeURIComponent("A real letter."));
    expect(b.atsUrl).toBe("https://acme.com/jobs/1");
  });

  it("falls back to the template subject when the cover has none, and to the template when the cover body is empty", () => {
    const b1 = buildApplyBundle(resume, role, "Alex", { body: "Real letter body here." });
    expect(b1.subject).toBe("Application — Staff PM at Acme");
    expect(b1.note).toBe("Real letter body here.");

    const b2 = buildApplyBundle(resume, role, "Alex", { subject: "s", body: "   " });
    expect(b2.note).toContain("A few things I'd bring");

    const b3 = buildApplyBundle(resume, role, "Alex", null);
    expect(b3.note).toContain("A few things I'd bring");
  });
});
