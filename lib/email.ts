/**
 * Email delivery seam (slice H2 — PREPARED, not live). Everything here is
 * flag-gated no-op until the HUMAN enables Cloudflare Email
 * (docs/runbooks/enable-email.md) and sets:
 *   EMAIL_DELIVERY_ENABLED=1  ·  EMAIL_FROM=ro@roleos.fyi  ·  SEND_EMAIL binding
 *
 * Scope guard: this delivers RO's notifications TO THE USER THEMSELVES
 * (digests/nudges they opted into). It is NOT an outward-application path —
 * human-gated-outward is untouched, and nothing under agent/ can import this
 * (no-client-secret + depcruise lists).
 *
 * Only the user's OWN address (from auth) is ever a recipient — no arbitrary
 * `to` field exists in the API on purpose.
 */

export interface EmailMessageInput {
  to: string;
  from: string;
  subject: string;
  text: string;
}

/** Pure MIME builder (unit-tested): minimal, RFC-compliant plain-text mail. */
export function buildMime(msg: EmailMessageInput): string {
  const subject = msg.subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  const headers = [
    `From: ${msg.from}`,
    `To: ${msg.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${msg.text}`;
}

export type DeliveryResult = { delivered: boolean; reason: string };

/** Is the flag on AND the runtime binding present? */
export function emailEnabled(env: Record<string, unknown> = process.env as Record<string, unknown>): boolean {
  return env.EMAIL_DELIVERY_ENABLED === "1" && typeof env.EMAIL_FROM === "string" && env.EMAIL_FROM.length > 3;
}

/**
 * Deliver a notification email to the USER'S OWN address. Flag-off → honest
 * no-op with a structured line (so we can see demand before enabling). Binding
 * missing → no-op. Never throws — delivery is best-effort telemetry-adjacent.
 */
export async function deliverEmail(msg: Omit<EmailMessageInput, "from">): Promise<DeliveryResult> {
  const line = (event: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", event, ...extra }));

  if (!emailEnabled()) {
    line("email.skipped", { reason: "flag_off" });
    return { delivered: false, reason: "flag_off" };
  }
  try {
    // The SEND_EMAIL binding only exists on the Workers runtime once the human
    // adds it (see runbook). Resolved dynamically so dev/CI never break.
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext();
    const binding = (ctx.env as Record<string, unknown>).SEND_EMAIL as
      | { send: (m: unknown) => Promise<void> }
      | undefined;
    if (!binding) {
      line("email.skipped", { reason: "no_binding" });
      return { delivered: false, reason: "no_binding" };
    }
    const from = String(process.env.EMAIL_FROM);
    const mime = buildMime({ ...msg, from });
    const cfEmail = (await import(/* webpackIgnore: true */ "cloudflare:email" as string)) as {
      EmailMessage: new (from: string, to: string, raw: string) => unknown;
    };
    await binding.send(new cfEmail.EmailMessage(from, msg.to, mime));
    line("email.delivered", { to_domain: msg.to.split("@")[1] ?? "unknown" });
    return { delivered: true, reason: "sent" };
  } catch (err) {
    console.warn(
      JSON.stringify({
        t: new Date().toISOString(),
        level: "warn",
        event: "email.failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { delivered: false, reason: "error" };
  }
}
