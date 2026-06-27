import { describe, it, expect } from "vitest";
import { jobSpec } from "@/agent/registry";

describe("model registry", () => {
  it("resolves each job to a provider + model", () => {
    expect(jobSpec("reason").model).toBe("claude-opus-4-8");
    expect(jobSpec("draft").model).toBe("claude-sonnet-4-6");
    expect(jobSpec("quick_tag").model).toBe("claude-haiku-4-5");
    expect(jobSpec("embed").provider).toBe("workers-ai");
  });

  it("never sends temperature on Anthropic jobs (would 400 on 4.8/4.6)", () => {
    for (const job of ["reason", "draft", "quick_tag", "critic"] as const) {
      const params = (jobSpec(job).params ?? {}) as Record<string, unknown>;
      expect(params.temperature).toBeUndefined();
      expect(params.top_p).toBeUndefined();
      expect(params.budget_tokens).toBeUndefined();
    }
  });

  it("embed model carries fixed dimensions (one vector space)", () => {
    expect(jobSpec("embed").dimensions).toBe(768);
  });

  it("throws on an unknown job", () => {
    // @ts-expect-error — deliberately invalid
    expect(() => jobSpec("nope")).toThrow();
  });
});
