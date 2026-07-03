/**
 * Structured logging (slice H1). One JSON line per event on stdout/stderr —
 * exactly what Cloudflare Workers Logs / observability indexes and filters.
 * Pure formatting is exported for tests; emission is console.* so it works
 * identically in `next dev`, Workers, and vitest.
 *
 * Secret hygiene: field values whose KEY looks secret-ish are redacted, and
 * Error objects are normalized (name/message/stack) — never `JSON.stringify`d
 * into `{}` silently.
 */

export type LogLevel = "info" | "warn" | "error";

const SECRET_KEY = /key|token|secret|password|authorization|cookie/i;

/** Normalize any thrown value into loggable fields. */
export function errorFields(err: unknown): { error: string; error_name?: string; stack?: string } {
  if (err instanceof Error) {
    return { error: err.message, error_name: err.name, stack: err.stack?.split("\n").slice(0, 5).join("\n") };
  }
  return { error: typeof err === "string" ? err : JSON.stringify(err)?.slice(0, 500) ?? "unknown" };
}

/** Build the JSON log line (pure — unit-tested). */
export function formatLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}): string {
  const out: Record<string, unknown> = { t: new Date().toISOString(), level, event };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : v instanceof Error ? errorFields(v) : v;
  }
  try {
    return JSON.stringify(out);
  } catch {
    // circular fields — degrade to the envelope, never throw from the logger
    return JSON.stringify({ t: out.t, level, event, log_error: "unserializable fields" });
  }
}

export function logInfo(event: string, fields?: Record<string, unknown>): void {
  console.log(formatLog("info", event, fields));
}

export function logWarn(event: string, fields?: Record<string, unknown>): void {
  console.warn(formatLog("warn", event, fields));
}

export function logError(event: string, err: unknown, fields?: Record<string, unknown>): void {
  console.error(formatLog("error", event, { ...errorFields(err), ...fields }));
}
