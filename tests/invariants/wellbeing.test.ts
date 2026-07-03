import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  decideNotification,
  BANNED_KINDS,
  DEFAULT_NOTIF_SETTINGS,
  DEFAULT_QUIET_HOURS,
  type NotifKind,
} from "@/lib/notifications";
import { buildPaceNudge } from "@/lib/pace-nudge";
import { computePlan } from "@/lib/plan/plan";

/**
 * INVARIANTS (stress-test harness, Slice 11): the wellbeing + human-gated-outward
 * promises, asserted programmatically so a future change can't silently break them.
 */
describe("wellbeing: engagement bait can never notify", () => {
  it("every BANNED kind resolves to tier 'never' under any context", () => {
    const contexts = [
      { localHour: 10, isWeekend: false },
      { localHour: 23, isWeekend: false },
      { localHour: 14, isWeekend: true },
    ];
    for (const kind of BANNED_KINDS as Set<NotifKind>) {
      for (const c of contexts) {
        const d = decideNotification(
          { kind, userActionable: true, timeSensitive: true }, // even if "urgent"
          {
            settings: DEFAULT_NOTIF_SETTINGS,
            quiet: DEFAULT_QUIET_HOURS,
            pushesSentToday: 0,
            pushesSentThisWeek: 0,
            ...c,
          },
        );
        expect(d.tier, `${kind} must never notify`).toBe("never");
      }
    }
  });
});

describe("wellbeing: pace nudges stay silent when things are fine", () => {
  const today = "2026-07-03";
  it("no nudge when on track or without a deadline", () => {
    const onTrack = computePlan(
      { deadline_date: "2026-12-01", intensity: { apps_per_week_ceiling: 30 } },
      { today, liveSupply: 200 },
    );
    expect(buildPaceNudge(onTrack, false)).toBeNull();
    expect(buildPaceNudge(computePlan({}, { today, liveSupply: 100 }), false)).toBeNull();
  });
});

describe("human-gated outward: the apply/nudge helpers never transport", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  // These modules compose outward-facing content (apply bundle, nudges) but MUST
  // never send: no fetch / XHR / WebSocket / SMTP. The user sends, always.
  const OUTBOUND = /\bfetch\s*\(|XMLHttpRequest|new WebSocket|nodemailer|smtp/i;

  it("lib/apply.ts builds compose URLs but performs no transport", () => {
    expect(OUTBOUND.test(read("../../lib/apply.ts"))).toBe(false);
  });

  it("lib/pace-nudge.ts performs no transport", () => {
    expect(OUTBOUND.test(read("../../lib/pace-nudge.ts"))).toBe(false);
  });
});
