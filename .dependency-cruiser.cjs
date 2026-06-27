/**
 * Architecture invariant guard (architecture.md §6, layer 3).
 * The agent layer cannot import any outbound transport or the dispatch route.
 * Drafting and sending are different modules; sending is a separate,
 * user-clicked route (app/api/dispatch). This makes "human-gated outward"
 * structurally impossible to bypass — and CI enforces it.
 */
module.exports = {
  forbidden: [
    {
      name: "agent-no-outbound-transport",
      comment:
        "agent/** must not import any outbound transport (no email/HTTP-send). RO drafts; a human clicks send.",
      severity: "error",
      from: { path: "^agent" },
      to: {
        path: [
          "nodemailer",
          "resend",
          "@sendgrid",
          "postmark",
          "mailgun",
          "twilio",
          "node:net",
          "node:http$",
          "node:https$",
        ],
      },
    },
    {
      name: "agent-no-dispatch",
      comment:
        "agent/** must not import the dispatch route — the only outbound path is user-initiated.",
      severity: "error",
      from: { path: "^agent" },
      to: { path: "^app/api/dispatch" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
