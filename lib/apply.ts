/**
 * Apply bundle composition (Slice 4). Pure helpers that turn an APPROVED résumé +
 * a role into everything the user needs to apply — a subject line, a short honest
 * cover note, and pre-filled compose URLs (Gmail / mailto) plus the company's ATS
 * apply link.
 *
 * CRITICAL — human-gated outward: nothing here SENDS. It only builds strings and
 * URLs; the user opens the compose window / ATS form and clicks send themselves.
 * No transport, no fetch, no side effects (keeps the no-send invariant intact).
 */

export interface ApplyRole {
  company?: string | null;
  role_title?: string | null;
  url?: string | null;
}

export interface ApplyResume {
  summary?: string;
  bullets?: { text: string }[];
}

export interface ApplyBundle {
  subject: string;
  /** a short, editable cover note templated from the real résumé (no invention) */
  note: string;
  /** the company's ATS/job apply page, if known — the usual submit path */
  atsUrl: string | null;
  /** pre-filled Gmail compose (recipient left blank for the user to fill) */
  gmailUrl: string;
  /** pre-filled mailto fallback */
  mailtoUrl: string;
}

/** Gmail compose deep-link (same shape the recruiter desk uses). */
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const p = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${p.toString()}`;
}

export function buildApplyBundle(
  resume: ApplyResume,
  role: ApplyRole,
  applicantName?: string,
): ApplyBundle {
  const title = role.role_title?.trim() || "the role";
  const company = role.company?.trim() || "your team";
  const subject = `Application — ${title}${role.company ? ` at ${company}` : ""}`;

  const opener = `Hi,\n\nI'd like to apply for ${title} at ${company}.`;
  const summary = resume.summary?.trim();
  const highlights = (resume.bullets ?? [])
    .map((b) => b.text?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((t) => `• ${t}`)
    .join("\n");

  const note = [
    opener,
    summary,
    highlights ? `A few things I'd bring:\n${highlights}` : "",
    `My tailored résumé is attached.${applicantName ? `\n\nBest,\n${applicantName}` : "\n\nBest,"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject,
    note,
    atsUrl: role.url?.trim() || null,
    gmailUrl: gmailComposeUrl("", subject, note),
    mailtoUrl: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(note)}`,
  };
}
