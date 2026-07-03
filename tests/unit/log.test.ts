import { describe, it, expect } from "vitest";
import { errorFields, formatLog } from "@/lib/log";

/**
 * Slice H1 — structured logging. One JSON line per event; secret-looking keys
 * are redacted; Errors normalize; the logger itself can never throw.
 */
describe("formatLog", () => {
  it("emits one parseable JSON line with envelope + fields", () => {
    const line = formatLog("info", "health.db", { latency_ms: 12 });
    const o = JSON.parse(line) as Record<string, unknown>;
    expect(o.level).toBe("info");
    expect(o.event).toBe("health.db");
    expect(o.latency_ms).toBe(12);
    expect(typeof o.t).toBe("string");
  });

  it("redacts secret-looking keys, never their siblings", () => {
    const o = JSON.parse(
      formatLog("warn", "x", { api_key: "sk-123", Authorization: "Bearer y", cookie: "abc", userId: "u1" }),
    ) as Record<string, unknown>;
    expect(o.api_key).toBe("[redacted]");
    expect(o.Authorization).toBe("[redacted]");
    expect(o.cookie).toBe("[redacted]");
    expect(o.userId).toBe("u1");
  });

  it("normalizes Error field values and skips undefined", () => {
    const o = JSON.parse(formatLog("error", "x", { err: new Error("boom"), missing: undefined })) as {
      err: { error: string };
      missing?: unknown;
    };
    expect(o.err.error).toBe("boom");
    expect("missing" in o).toBe(false);
  });

  it("never throws on circular fields", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    const o = JSON.parse(formatLog("error", "x", { a })) as Record<string, unknown>;
    expect(o.event).toBe("x");
    expect(o.log_error).toBe("unserializable fields");
  });
});

describe("errorFields", () => {
  it("handles Error, string, and object throws", () => {
    expect(errorFields(new Error("e")).error).toBe("e");
    expect(errorFields("plain").error).toBe("plain");
    expect(errorFields({ code: 5 }).error).toBe('{"code":5}');
  });
  it("caps stack traces to a handful of frames", () => {
    const f = errorFields(new Error("deep"));
    expect((f.stack ?? "").split("\n").length).toBeLessThanOrEqual(5);
  });
});
