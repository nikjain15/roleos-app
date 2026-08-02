import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Provider resilience on the single callModel path (agent/retry.ts).
 *
 * RoleOS makes several provider calls per job (tool-loop turns, the critic, the
 * truth gate, an escalated tier), so ONE transient 429 mid-loop used to fail the
 * whole run. These tests lock the ladder that now sits in front of the quality
 * gate: what is retried, what must never be retried, what bounds the waiting,
 * and, the subtle one, that tokens already paid for are still metered when a
 * run dies, so retries cannot hide spend from the daily budget guard.
 *
 * No real timers, no wall clock, no network, no DB: the clock is injected.
 */

const { create, ctorOpts } = vi.hoisted(() => ({
  create: vi.fn(),
  ctorOpts: [] as unknown[],
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
    constructor(opts: unknown) {
      ctorOpts.push(opts);
    }
  },
}));

vi.mock("@/lib/env", () => ({
  env: () => ({ ANTHROPIC_API_KEY: "test-key" }),
}));

import { callModel, MeteredProviderError } from "@/agent/registry";
import {
  backoffDelayMs,
  classifyProviderError,
  createRetryRunner,
  parseRetryAfterMs,
  ProviderCallError,
  retryBudgetFor,
  RETRY_AFTER_CAP_MS,
  tunedBudgetJobs,
} from "@/agent/retry";
import registry from "@/agent/registry.json" assert { type: "json" };
import type { Tool } from "@/agent/tools";

/** An HTTP failure shaped like the Anthropic SDK's error objects. */
function httpError(status: number, headers?: Record<string, string>) {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers });
}

function textResp(text: string) {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 5, output_tokens: 7 },
  };
}

function toolUseResp(name: string, input: unknown) {
  return {
    content: [{ type: "tool_use", id: "tu_1", name, input }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 3 },
  };
}

/**
 * Injected clock. `sleep` is instant but still advances the fake clock, so
 * backoff waits count against the total budget exactly as they would in
 * production. `setTimer` never fires unless a test asks it to.
 */
function fakeClock(opts: { timerFiresImmediately?: boolean } = {}) {
  let t = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    at: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    deps: {
      now: () => t,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        t += ms;
      },
      random: () => 0.5, // deterministic middle of the jitter window
      setTimer: (_ms: number, fn: () => void) => {
        if (opts.timerFiresImmediately) fn();
        return () => {};
      },
    },
  };
}

const searchTool: Tool = {
  name: "search_roles",
  description: "search",
  schema: z.object({ query: z.string().min(1) }).strict() as unknown as Tool["schema"],
  jsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  run: vi.fn(async (input: unknown) => ({ echoed: (input as { query: string }).query })),
};

beforeEach(() => {
  create.mockReset();
  ctorOpts.length = 0;
});

describe("callModel · retry ladder", () => {
  it("a healthy call is answered on the first round-trip, with no retry tax", async () => {
    const clock = fakeClock();
    create.mockResolvedValueOnce(textResp("fine"));

    const res = await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps });

    expect(create).toHaveBeenCalledTimes(1);
    expect(res.text).toBe("fine");
    expect(clock.sleeps).toEqual([]);
  });

  it("a transient 429 no longer fails the run: it is retried and the answer still arrives", async () => {
    const clock = fakeClock();
    create.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(textResp("recovered"));

    const res = await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps });

    expect(create).toHaveBeenCalledTimes(2);
    expect(res.text).toBe("recovered");
    expect(clock.sleeps).toHaveLength(1);
  });

  it("a 500 and a 529 are both treated as transient, not as our bug", async () => {
    const clock = fakeClock();
    create
      .mockRejectedValueOnce(httpError(500))
      .mockRejectedValueOnce(httpError(529))
      .mockResolvedValueOnce(textResp("ok"));

    const res = await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps });
    expect(create).toHaveBeenCalledTimes(3);
    expect(res.text).toBe("ok");
  });

  it("gives up at the attempt cap and surfaces a typed provider failure, never an endless loop", async () => {
    const clock = fakeClock();
    create.mockRejectedValue(httpError(503));

    const err = await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(MeteredProviderError);
    expect(err).toBeInstanceOf(ProviderCallError);
    expect(create).toHaveBeenCalledTimes(retryBudgetFor("quick_tag").maxAttempts);
    expect(err.attempts).toBe(retryBudgetFor("quick_tag").maxAttempts);
    expect(err.status).toBe(503);
    // Honest, not opaque: the message says what happened and how hard we tried.
    expect(err.message).toMatch(/gave up after 3 attempt\(s\) \(HTTP 503\)/);
  });

  it("a 400 fails fast with no retry, so a bad sampling param is loud instead of slow", async () => {
    // The registry already knows Opus 4.8 / Sonnet 4.6 400 on temperature and
    // Haiku 400s on effort. Retrying a 400 would burn three round-trips and
    // then report an outage for what is our own malformed request.
    const clock = fakeClock();
    create.mockRejectedValue(httpError(400));

    const err = await callModel("draft", { prompt: "hi" }, { retryDeps: clock.deps }).catch((e) => e);

    expect(create).toHaveBeenCalledTimes(1);
    expect(err.attempts).toBe(1);
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/failed fast, not retryable \(HTTP 400\)/);
    expect(clock.sleeps).toEqual([]);
  });

  it("a 401 fails fast with no retry, so a bad key is never hammered", async () => {
    const clock = fakeClock();
    create.mockRejectedValue(httpError(401));

    const err = await callModel("draft", { prompt: "hi" }, { retryDeps: clock.deps }).catch((e) => e);

    expect(create).toHaveBeenCalledTimes(1);
    expect(err.status).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it("honours a server Retry-After instead of guessing with its own backoff", async () => {
    const clock = fakeClock();
    create
      .mockRejectedValueOnce(httpError(429, { "retry-after": "5" }))
      .mockResolvedValueOnce(textResp("ok"));

    await callModel("draft", { prompt: "hi" }, { retryDeps: clock.deps });

    expect(clock.sleeps).toEqual([5000]);
  });

  it("caps an absurd Retry-After so a provider cannot park a user's request for an hour", async () => {
    const clock = fakeClock();
    create
      .mockRejectedValueOnce(httpError(429, { "retry-after": "3600" }))
      .mockResolvedValueOnce(textResp("ok"));

    await callModel("draft", { prompt: "hi" }, { retryDeps: clock.deps });

    expect(clock.sleeps).toEqual([RETRY_AFTER_CAP_MS]);
  });

  it("aborts a hanging call at the per-attempt timeout rather than waiting forever", async () => {
    const clock = fakeClock({ timerFiresImmediately: true });
    // A transport that never resolves AND ignores the abort signal: the race in
    // createRetryRunner is what stops it, not the SDK's good manners.
    create.mockImplementation(() => new Promise(() => {}));

    const err = await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(MeteredProviderError);
    expect(err.kind).toBe("abort");
    expect(create).toHaveBeenCalledTimes(retryBudgetFor("quick_tag").maxAttempts);
  });

  it("passes an AbortSignal to the SDK so a timed-out attempt is actually cancelled", async () => {
    const clock = fakeClock();
    create.mockResolvedValueOnce(textResp("ok"));

    await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps });

    const second = create.mock.calls[0][1] as { signal?: AbortSignal };
    expect(second?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sets the SDK's own maxRetries to 0, so retry layering is deliberate not inherited", async () => {
    const clock = fakeClock();
    create.mockResolvedValueOnce(textResp("ok"));

    await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps });

    expect(ctorOpts[0]).toMatchObject({ maxRetries: 0 });
  });
});

describe("callModel · retries vs the daily spend budget", () => {
  it("records tokens already spent when a later tool-loop turn dies, so failed work still hits agent_runs", async () => {
    // The accounting hole retry would have widened: turn 1 was billed, turn 2
    // fails, and the old code threw away the counters, so no agent_runs row, and
    // lib/cost-budget.ts never saw the spend. The record now rides the error.
    const clock = fakeClock();
    create
      .mockResolvedValueOnce(toolUseResp("search_roles", { query: "ai pm" }))
      .mockRejectedValue(httpError(503));

    const err = await callModel(
      "reason",
      { prompt: "find roles" },
      { skill: "t", tools: [searchTool], toolContext: { userId: "u1" }, retryDeps: clock.deps },
    ).catch((e) => e);

    expect(err).toBeInstanceOf(MeteredProviderError);
    expect(err.run.input_tokens).toBe(10);
    expect(err.run.output_tokens).toBe(3);
    expect(err.run.cost_usd).toBeGreaterThan(0);
    expect(err.run.model).toBe("claude-opus-4-8");
    expect(err.run.skill).toBe("t");
  });

  it("counts a failed attempt as zero tokens rather than inventing spend", async () => {
    // A provider error response carries no usage block. Reporting a guess would
    // corrupt the budget in the other direction.
    const clock = fakeClock();
    create.mockRejectedValue(httpError(503));

    const err = await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps }).catch(
      (e) => e,
    );

    expect(err.run.input_tokens).toBe(0);
    expect(err.run.cost_usd).toBe(0);
  });

  it("retries never multiply into unmetered round-trips: the SDK adds none of its own", async () => {
    const clock = fakeClock();
    create.mockRejectedValue(httpError(503));

    await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps }).catch(() => {});

    // Exactly our budget, not our budget times the SDK's silent default.
    expect(create).toHaveBeenCalledTimes(3);
  });
});

describe("retry ladder · bounded total elapsed", () => {
  const budget = {
    maxAttempts: 5,
    perAttemptTimeoutMs: 1_000,
    totalBudgetMs: 2_500,
    baseDelayMs: 100,
    maxDelayMs: 100,
  };

  it("a second tool-loop turn cannot restart the clock: the deadline is shared per job", async () => {
    const clock = fakeClock();
    const runner = createRetryRunner(budget, clock.deps, "test");

    // Burn the whole budget on the first turn.
    await runner
      .run(async () => {
        clock.advance(3_000);
        throw httpError(503);
      })
      .catch(() => {});

    const fn = vi.fn(async () => "never");
    const err = await runner.run(fn).catch((e) => e);

    expect(fn).not.toHaveBeenCalled(); // no round-trip is even attempted
    expect(err).toBeInstanceOf(ProviderCallError);
    expect(err.message).toMatch(/total time budget of 2500ms exhausted/);
  });

  it("refuses a backoff it cannot afford instead of sleeping into a certain timeout", async () => {
    const clock = fakeClock();
    const runner = createRetryRunner(
      { ...budget, baseDelayMs: 5_000, maxDelayMs: 5_000 },
      clock.deps,
      "test",
    );

    const err = await runner
      .run(async () => {
        clock.advance(1_000);
        throw httpError(503);
      })
      .catch((e) => e);

    expect(err.attempts).toBe(1);
    expect(clock.sleeps).toEqual([]); // 2500ms budget, 2500ms backoff: not worth it
  });
});

describe("retry ladder · error classification", () => {
  it("only the transient statuses are retried; 400 and 401 never are", () => {
    for (const s of [429, 500, 502, 503, 504, 529]) {
      expect(classifyProviderError(httpError(s), 0).retryable, `HTTP ${s}`).toBe(true);
    }
    for (const s of [400, 401, 403, 404, 413, 422]) {
      expect(classifyProviderError(httpError(s), 0).retryable, `HTTP ${s}`).toBe(false);
    }
  });

  it("network and abort failures are retried, so a dropped socket is not an outage", () => {
    expect(classifyProviderError(new TypeError("fetch failed"), 0)).toMatchObject({
      retryable: true,
      kind: "network",
    });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyProviderError(abort, 0)).toMatchObject({ retryable: true, kind: "abort" });
  });

  it("an unrecognised error is NOT retried, so a logic bug fails loudly", () => {
    expect(classifyProviderError(new Error("cannot read property x"), 0)).toMatchObject({
      retryable: false,
      kind: "other",
    });
  });

  it("Retry-After accepts seconds and HTTP-dates, and rejects junk rather than trusting it", () => {
    expect(parseRetryAfterMs("2", 0)).toBe(2000);
    expect(parseRetryAfterMs(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(parseRetryAfterMs("banana", 0)).toBeUndefined();
    expect(parseRetryAfterMs("-5", 0)).toBeUndefined();
    expect(parseRetryAfterMs("0", 0)).toBeUndefined();
    expect(parseRetryAfterMs(undefined, 0)).toBeUndefined();
  });

  it("backoff uses FULL jitter, so retrying isolates never resynchronise into a herd", () => {
    const b = { baseDelayMs: 500, maxDelayMs: 8_000 };
    expect(backoffDelayMs(0, b, () => 0)).toBe(0);
    expect(backoffDelayMs(0, b, () => 0.999)).toBeLessThan(500);
    expect(backoffDelayMs(3, b, () => 0.999)).toBeLessThan(4_000);
    // The window grows exponentially but is capped.
    expect(backoffDelayMs(10, b, () => 0.5)).toBe(4_000);
  });
});

describe("retry budgets are chosen per tier, not inherited by accident", () => {
  it("every Anthropic registry job has an explicitly tuned budget", () => {
    const anthropicJobs = Object.entries(registry.jobs)
      .filter(([, s]) => (s as { provider: string }).provider === "anthropic")
      .map(([j]) => j);
    for (const job of anthropicJobs) {
      expect(tunedBudgetJobs(), `job "${job}" has no tuned retry budget`).toContain(job);
    }
  });

  it("the cheap interactive tier waits far less than the long-generation tiers", () => {
    expect(retryBudgetFor("quick_tag").perAttemptTimeoutMs).toBeLessThan(
      retryBudgetFor("draft").perAttemptTimeoutMs,
    );
    expect(retryBudgetFor("quick_tag").totalBudgetMs).toBeLessThan(
      retryBudgetFor("reason").totalBudgetMs,
    );
    // The most expensive generation gets the fewest retries: two 16k outputs is
    // already a lot of spend for one artifact.
    expect(retryBudgetFor("code").maxAttempts).toBeLessThan(retryBudgetFor("draft").maxAttempts);
  });

  it("every budget is internally coherent (a single attempt always fits the total)", () => {
    for (const job of tunedBudgetJobs()) {
      const b = retryBudgetFor(job);
      expect(b.maxAttempts).toBeGreaterThanOrEqual(2);
      expect(b.perAttemptTimeoutMs).toBeLessThanOrEqual(b.totalBudgetMs);
      expect(b.baseDelayMs).toBeLessThanOrEqual(b.maxDelayMs);
    }
  });
});

describe("resilience adds no outbound capability", () => {
  it("the retry path imports no transport: retrying still only re-reads, never sends", () => {
    const src = readFileSync(new URL("../../agent/retry.ts", import.meta.url), "utf8");
    for (const re of [/from "node:http/, /nodemailer/, /resend/, /sendgrid/, /\bfetch\(/]) {
      expect(re.test(src), `agent/retry.ts matches forbidden ${re}`).toBe(false);
    }
  });

  it("a retried call replays the SAME read-only request, it does not mutate it", async () => {
    const clock = fakeClock();
    create.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(textResp("ok"));

    await callModel("quick_tag", { prompt: "hi" }, { retryDeps: clock.deps });

    expect(create.mock.calls[0][0]).toEqual(create.mock.calls[1][0]);
    expect(create.mock.calls[0][0].tools).toBeUndefined();
  });
});
