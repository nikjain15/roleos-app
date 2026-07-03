import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateBody, validateValue } from "@/lib/validate";

const Schema = z.object({ name: z.string().min(1), count: z.number().int().positive() });

function jsonReq(body: string): Request {
  return new Request("http://t/", { method: "POST", body });
}

describe("validateBody", () => {
  it("accepts a well-formed body and returns typed data", async () => {
    const r = await validateBody(jsonReq(JSON.stringify({ name: "a", count: 3 })), Schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ name: "a", count: 3 });
  });

  it("rejects malformed JSON with a 400 (not a throw)", async () => {
    const r = await validateBody(jsonReq("{not json"), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it("rejects a shape mismatch with field-level issues", async () => {
    const r = await validateBody(jsonReq(JSON.stringify({ name: "", count: -1 })), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = (await r.response.json()) as { error: string; issues: unknown[] };
      expect(body.error).toBe("validation failed");
      expect(body.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("validateValue", () => {
  it("validates a pre-parsed object", () => {
    expect(validateValue(Schema, { name: "x", count: 1 }).ok).toBe(true);
    expect(validateValue(Schema, { name: "x" }).ok).toBe(false);
  });
});
