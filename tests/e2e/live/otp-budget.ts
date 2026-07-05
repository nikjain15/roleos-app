import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * T2 — OTP-budget-aware pacing for the live harness. Supabase rate-limits OTP
 * verification (~30 per 5 min per IP, project default); the full suite seeds
 * 40+ users, so an unpaced run exhausts the budget MID-RUN and every later
 * spec fails at seed time (found in X1; every slice since chunked by hand).
 *
 * This module makes `createUser` self-pacing: a timestamp ledger (persisted in
 * the OS tmpdir so back-to-back runs share it) counts recent verifications and
 * sleeps exactly as long as needed before the budget window frees up. Workers
 * run sequentially in this suite, so a plain file is race-free. Stays a bit
 * under the real limit to leave headroom for anything external to the ledger.
 */

/** Supabase default is ~30/5min — pace to 26 so unledgered strays still fit. */
export const OTP_BUDGET_MAX = 26;
export const OTP_WINDOW_MS = 5 * 60_000;

/** Pure: how long to wait before the next verification fits the budget. */
export function otpDelayMs(
  timestamps: number[],
  now: number,
  max: number = OTP_BUDGET_MAX,
  windowMs: number = OTP_WINDOW_MS,
): number {
  const recent = timestamps.filter((t) => Number.isFinite(t) && now - t < windowMs).sort((a, b) => a - b);
  if (recent.length < max) return 0;
  // Wait until the oldest of the last `max` falls out of the window (+jitter guard).
  const oldestBlocking = recent[recent.length - max];
  return Math.max(0, oldestBlocking + windowMs - now + 1_500);
}

/** Pure: prune entries older than the window (keeps the ledger tiny). */
export function pruneLedger(timestamps: number[], now: number, windowMs: number = OTP_WINDOW_MS): number[] {
  return timestamps.filter((t) => Number.isFinite(t) && now - t < windowMs);
}

// One ledger per machine — back-to-back runs (and chunked runs) share the budget.
const LEDGER_PATH = join(tmpdir(), "roleos-otp-ledger.json");

function readLedger(): number[] {
  try {
    const parsed = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is number => typeof t === "number") : [];
  } catch {
    return [];
  }
}

function writeLedger(timestamps: number[]): void {
  try {
    writeFileSync(LEDGER_PATH, JSON.stringify(timestamps));
  } catch {
    /* a broken ledger only costs pacing accuracy, never a failure */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * What the next paceOtp() would wait right now — fixtures use this to extend
 * the CURRENT test's timeout before a paced pause, so budget waits never read
 * as test hangs.
 */
export function expectedOtpDelayMs(now = Date.now()): number {
  return otpDelayMs(pruneLedger(readLedger(), now), now);
}

/**
 * Block until an OTP verification fits the budget, then record it. Called by
 * `createUser` right before `verifyOtp`.
 */
export async function paceOtp(now = Date.now()): Promise<void> {
  const ledger = pruneLedger(readLedger(), now);
  const wait = otpDelayMs(ledger, now);
  if (wait > 0) {
    // Visible in the runner output so a paused suite never looks hung.
    console.log(`[otp-budget] window full (${ledger.length} in 5min) — pacing ${Math.ceil(wait / 1000)}s`);
    await sleep(wait);
  }
  const after = Date.now();
  writeLedger([...pruneLedger(readLedger(), after), after]);
}

/**
 * True when an auth error smells like the OTP budget (Supabase phrases vary).
 * `createUser` retries ONCE after a full window on these — robust to burn the
 * ledger never saw (another machine, an earlier manual run).
 */
export function isOtpRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err ?? "");
  return /rate ?limit|too many|429|over_request_rate_limit/i.test(msg);
}

/** Exposed for tests. */
export const _internals = { LEDGER_PATH, readLedger, writeLedger, mkdtempSync };
