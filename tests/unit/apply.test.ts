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
});
