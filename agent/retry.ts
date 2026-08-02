/**
 * PROVIDER RESILIENCE for the single `callModel` path (architecture.md §3.1).
 *
 * RoleOS routes every Anthropic call through one function, so retry belongs
 * here and nowhere else: add it once and every skill, every gate call and every
 * tool-loop turn inherits it. This module is the pure, network-free machinery:
 * error classification, backoff, the per-attempt abort and the whole-call
 * deadline. `agent/registry.ts` is the only caller.
 *
 * The design rule this does NOT change: RO fails honestly. Retry sits in FRONT
 * of the quality gate, it does not replace it. A transient blip is absorbed; a
 * genuine outage still surfaces as a typed failure carrying the tokens already
 * spent, so nothing is silently swallowed and nothing is silently unmetered.
 */

/** Transient HTTP statuses. Everything else is treated as fatal by default. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

/**
 * Statuses we must NEVER retry, listed explicitly because retrying them is the
 * expensive mistake. 400 in particular: Opus 4.8 / Sonnet 4.6 reject
 * `temperature`/`top_p`/`budget_tokens` and Haiku rejects `effort` (see
 * agent/registry.json), so a 400 means WE built a bad request. Retrying it
 * burns three round-trips and then reports the wrong story. It must fail fast
 * and loudly so the bad param is fixed. 401 is a bad key: same reasoning.
 */
const NEVER_RETRY_STATUS = new Set([400, 401]);

/**
 * Hard ceiling on a server-supplied Retry-After. A provider (or a proxy in
 * front of one) can legitimately answer "come back in an hour"; honouring that
 * literally would park a user's request for an hour behind a spinner. We honour
 * the hint up to 20s and otherwise give up, which is the honest answer anyway.
 */
export const RETRY_AFTER_CAP_MS = 20_000;

export type FailureKind = "http" | "network" | "abort" | "other";

export interface ErrorClass {
  retryable: boolean;
  kind: FailureKind;
  status?: number;
  /** Server-supplied wait hint, already capped at RETRY_AFTER_CAP_MS. */
  retryAfterMs?: number;
}

/** A model call that could not be completed. Typed so callers can tell a
 *  provider outage from a bug in our own request. */
export class ProviderCallError extends Error {
  readonly kind: FailureKind;
  readonly status?: number;
  /** How many provider round-trips were attempted before giving up. */
  readonly attempts: number;
  /** Whether the ladder gave up because retries ran out vs. failed fast. */
  readonly retryable: boolean;

  constructor(
    message: string,
    info: { kind: FailureKind; status?: number; attempts: number; retryable: boolean; cause?: unknown },
  ) {
    super(message, { cause: info.cause });
    this.name = "ProviderCallError";
    this.kind = info.kind;
    this.status = info.status;
    this.attempts = info.attempts;
    this.retryable = info.retryable;
  }
}

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: unknown; response?: { status?: unknown } };
  if (typeof e.status === "number") return e.status;
  if (e.response && typeof e.response.status === "number") return e.response.status;
  return undefined;
}

function headerOf(err: unknown, name: string): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const h = (err as { headers?: unknown }).headers;
  if (!h) return undefined;
  // Both a plain object bag and a fetch Headers instance turn up in the wild.
  if (typeof (h as Headers).get === "function") {
    return (h as Headers).get(name) ?? undefined;
  }
  const bag = h as Record<string, unknown>;
  const hit = Object.keys(bag).find((k) => k.toLowerCase() === name.toLowerCase());
  return hit && typeof bag[hit] === "string" ? (bag[hit] as string) : undefined;
}

/**
 * Parse Retry-After (delta-seconds or an HTTP-date) into ms, capped. Returns
 * undefined for anything unparseable or non-positive so the caller falls back
 * to its own backoff rather than trusting junk.
 */
export function parseRetryAfterMs(raw: string | undefined, nowMs: number): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const seconds = Number(trimmed);
  let ms: number;
  if (Number.isFinite(seconds)) {
    ms = seconds * 1000;
  } else {
    const at = Date.parse(trimmed);
    if (!Number.isFinite(at)) return undefined;
    ms = at - nowMs;
  }
  if (!(ms > 0)) return undefined;
  return Math.min(ms, RETRY_AFTER_CAP_MS);
}

/** Is this failure worth another round-trip, and how long should we wait? */
export function classifyProviderError(err: unknown, nowMs: number): ErrorClass {
  const status = statusOf(err);
  if (typeof status === "number") {
    if (NEVER_RETRY_STATUS.has(status)) return { retryable: false, kind: "http", status };
    if (RETRYABLE_STATUS.has(status)) {
      return {
        retryable: true,
        kind: "http",
        status,
        retryAfterMs: parseRetryAfterMs(headerOf(err, "retry-after"), nowMs),
      };
    }
    // 403 / 404 / 413 / 422 and friends: our request is wrong, not the network.
    return { retryable: false, kind: "http", status };
  }

  const name = err instanceof Error ? err.name : "";
  const code = (err as { code?: unknown } | null)?.code;
  const msg = err instanceof Error ? err.message : String(err ?? "");

  if (name === "AbortError" || name === "TimeoutError" || name === "ProviderTimeoutError") {
    // We aborted this attempt ourselves (per-attempt timeout). Another attempt
    // is reasonable; the whole-call deadline is what stops the bleeding.
    return { retryable: true, kind: "abort" };
  }
  if (
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError" ||
    name === "FetchError" ||
    typeof code === "string" ||
    /fetch failed|network|socket|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(msg)
  ) {
    return { retryable: true, kind: "network" };
  }
  return { retryable: false, kind: "other" };
}

/**
 * Full-jitter exponential backoff: wait a uniformly random slice of the current
 * exponential window. Full jitter (rather than plain exponential) is the point:
 * when a provider sheds load, every RoleOS isolate retrying on the same curve
 * would re-synchronise into a second thundering herd. Randomising the whole
 * window spreads them out.
 */
export function backoffDelayMs(
  attempt: number,
  budget: Pick<RetryBudget, "baseDelayMs" | "maxDelayMs">,
  random: () => number,
): number {
  const window = Math.min(budget.maxDelayMs, budget.baseDelayMs * 2 ** attempt);
  return Math.floor(random() * window);
}

export interface RetryBudget {
  /** Total provider round-trips for ONE turn, including the first. */
  maxAttempts: number;
  /** Abort a single round-trip after this long. */
  perAttemptTimeoutMs: number;
  /** Ceiling on the WHOLE callModel invocation: every tool-loop turn, every
   *  retry and every backoff wait, added up. */
  totalBudgetMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Per-tier budgets. The tiers differ in how long a legitimate call takes and in
 * how expensive a wasted attempt is, so one number would be wrong everywhere:
 *
 *  • quick_tag (Haiku, 1k out): classification on interactive paths. A healthy
 *    call is ~1s, so 20s already means something is wrong; retry quickly and
 *    keep the whole thing inside a minute so a recruiter-label lookup can never
 *    dominate a page load.
 *  • draft (Sonnet, 8k out): a full multi-role résumé genuinely takes ~30-60s,
 *    so the per-attempt window has to be generous or we would abort real work.
 *  • code (Sonnet, 16k out): the longest single generation we make and the
 *    most expensive to throw away, so it gets the widest window but only ONE
 *    retry: two 16k generations is already a lot of spend for one artifact.
 *  • reason / critic (Opus + adaptive thinking): slow by design; thinking
 *    tokens mean a healthy call can sit quiet for a while before first output.
 *
 * totalBudgetMs is deliberately NOT maxAttempts x perAttemptTimeoutMs. The tool
 * loop runs up to MAX_TOOL_TURNS (6) provider calls per invocation, so a
 * per-turn bound alone compounds six-fold. The total is what keeps a single
 * job inside the platform request ceiling regardless of how the turns fall.
 */
const BUDGETS: Record<string, RetryBudget> = {
  quick_tag: { maxAttempts: 3, perAttemptTimeoutMs: 20_000, totalBudgetMs: 60_000, baseDelayMs: 250, maxDelayMs: 4_000 },
  draft: { maxAttempts: 3, perAttemptTimeoutMs: 90_000, totalBudgetMs: 240_000, baseDelayMs: 500, maxDelayMs: 8_000 },
  code: { maxAttempts: 2, perAttemptTimeoutMs: 180_000, totalBudgetMs: 300_000, baseDelayMs: 500, maxDelayMs: 8_000 },
  reason: { maxAttempts: 3, perAttemptTimeoutMs: 120_000, totalBudgetMs: 300_000, baseDelayMs: 500, maxDelayMs: 8_000 },
  critic: { maxAttempts: 3, perAttemptTimeoutMs: 60_000, totalBudgetMs: 180_000, baseDelayMs: 500, maxDelayMs: 8_000 },
};

/** The `draft` budget is the conservative middle of the range: an unknown job
 *  gets a real retry ladder rather than silently getting none. */
export const DEFAULT_BUDGET: RetryBudget = BUDGETS.draft;

export function retryBudgetFor(job: string): RetryBudget {
  return BUDGETS[job] ?? DEFAULT_BUDGET;
}

/** Every job name that has an explicitly tuned budget (asserted in tests). */
export function tunedBudgetJobs(): string[] {
  return Object.keys(BUDGETS);
}

/** Cancel handle for an injected timer. */
export type CancelTimer = () => void;

/**
 * Injected clock/timers so tests need no real timers and no wall-clock waits.
 * `sleep` covers backoff waits; `setTimer` arms the per-attempt abort.
 */
export interface RetryDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  setTimer: (ms: number, fn: () => void) => CancelTimer;
}

export const defaultRetryDeps: RetryDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: () => Math.random(),
  setTimer: (ms, fn) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export interface RetryRunner {
  /** Run one provider round-trip with retry, inside the shared deadline. */
  run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T>;
  /** Total provider round-trips made so far across every `run` call. */
  readonly attempts: number;
}

/**
 * Build a runner whose whole-call deadline is shared across every `run`. The
 * tool loop calls `run` once per turn, so the deadline is what bounds TOTAL
 * elapsed time for the invocation rather than each turn separately.
 */
export function createRetryRunner(
  budget: RetryBudget,
  deps: Partial<RetryDeps> = {},
  label = "model call",
): RetryRunner {
  const d: RetryDeps = { ...defaultRetryDeps, ...deps };
  const startedAt = d.now();
  let attempts = 0;

  const remaining = () => budget.totalBudgetMs - (d.now() - startedAt);

  async function attempt<T>(fn: (signal: AbortSignal) => Promise<T>, windowMs: number): Promise<T> {
    const ctl = new AbortController();
    const cancel = d.setTimer(windowMs, () => ctl.abort());
    // Race the call against our own abort: the SDK honours the signal, but a
    // transport that ignores it must not be able to hang the request either.
    const aborted = new Promise<never>((_, reject) => {
      const onAbort = () => {
        const e = new Error(`${label}: attempt exceeded ${windowMs}ms`);
        e.name = "ProviderTimeoutError";
        reject(e);
      };
      if (ctl.signal.aborted) onAbort();
      else ctl.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([fn(ctl.signal), aborted]);
    } finally {
      cancel();
    }
  }

  async function run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    let lastClass: ErrorClass = { retryable: false, kind: "other" };
    let lastErr: unknown;

    for (let i = 0; i < budget.maxAttempts; i++) {
      const left = remaining();
      if (left <= 0) {
        throw new ProviderCallError(
          `${label}: total time budget of ${budget.totalBudgetMs}ms exhausted after ${attempts} attempt(s)`,
          { kind: "abort", attempts, retryable: true, cause: lastErr },
        );
      }
      attempts++;
      try {
        // Never let one attempt outlive the whole-call deadline.
        return await attempt(fn, Math.min(budget.perAttemptTimeoutMs, left));
      } catch (err) {
        lastErr = err;
        lastClass = classifyProviderError(err, d.now());
        if (!lastClass.retryable) break;
        if (i === budget.maxAttempts - 1) break;

        const backoff = lastClass.retryAfterMs ?? backoffDelayMs(i, budget, d.random);
        // A wait we cannot afford is not a wait worth taking: give up now and
        // report honestly rather than sleeping into a certain timeout.
        if (backoff >= remaining()) break;
        await d.sleep(backoff);
      }
    }

    const detail = lastClass.status ? ` (HTTP ${lastClass.status})` : ` (${lastClass.kind})`;
    const why = lastClass.retryable
      ? `gave up after ${attempts} attempt(s)`
      : `failed fast, not retryable`;
    throw new ProviderCallError(`${label}: ${why}${detail}`, {
      kind: lastClass.kind,
      status: lastClass.status,
      attempts,
      retryable: lastClass.retryable,
      cause: lastErr,
    });
  }

  return {
    run,
    get attempts() {
      return attempts;
    },
  };
}
