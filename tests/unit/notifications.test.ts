import { describe, it, expect } from "vitest";
import {
  decideNotification,
  inQuietHours,
  DEFAULT_QUIET_HOURS,
  type NotifContext,
  type NotifCandidate,
} from "@/lib/notifications";

const base: NotifContext = {
  settings: { cadence: "daily" },
  quiet: DEFAULT_QUIET_HOURS, // 21→8, weekends off
  localHour: 14, // mid-afternoon weekday
  isWeekend: false,
  pushesSentToday: 0,
  pushesSentThisWeek: 0,
};
const deadline: NotifCandidate = { kind: "deadline", userActionable: true, timeSensitive: true };
const draft: NotifCandidate = { kind: "draft_ready", userActionable: true, timeSensitive: false };
const progress: NotifCandidate = { kind: "progress", userActionable: false, timeSensitive: false };

describe("notifications · wellbeing invariants", () => {
  it("BANS engagement bait — it can never notify", () => {
    for (const kind of ["reengagement_guilt", "streak_loss", "unread_count", "generic_nudge"] as const) {
      const d = decideNotification({ kind, userActionable: false, timeSensitive: false }, base);
      expect(d.tier).toBe("never");
    }
  });

  it("routine 'what RO did' only sits in the feed — never interrupts", () => {
    expect(decideNotification(progress, base).tier).toBe("in_feed");
  });

  it("a real deadline pushes during the day", () => {
    expect(decideNotification(deadline, base).tier).toBe("push");
  });

  it("a non-urgent draft batches into the digest on daily cadence", () => {
    expect(decideNotification(draft, base).tier).toBe("digest");
  });

  it("quiet hours hold non-deadlines, but a deadline breaks through GENTLY", () => {
    const night = { ...base, localHour: 23, settings: { cadence: "realtime" as const } };
    // a realtime user-actionable item at 11pm → held for digest
    expect(decideNotification(draft, night).tier).toBe("digest");
    // a hard deadline at 11pm → still pushes, but gently
    const d = decideNotification(deadline, night);
    expect(d.tier).toBe("push");
    expect(d.gentle).toBe(true);
  });

  it("'only when I open' never interrupts — even a deadline waits in the feed", () => {
    const open = { ...base, settings: { cadence: "open" as const } };
    expect(decideNotification(deadline, open).tier).toBe("in_feed");
    expect(decideNotification(draft, open).tier).toBe("in_feed");
  });

  it("weekend quiet holds non-deadline pushes", () => {
    const weekend = { ...base, isWeekend: true, settings: { cadence: "realtime" as const } };
    expect(decideNotification(draft, weekend).tier).toBe("digest");
    expect(decideNotification(deadline, weekend).tier).toBe("push"); // deadline still breaks through
  });

  it("push caps hold extra pushes, but a deadline overrides the cap", () => {
    const capped = { ...base, pushesSentToday: 1, settings: { cadence: "realtime" as const } };
    expect(decideNotification(draft, capped).tier).toBe("digest"); // over the daily cap
    expect(decideNotification(deadline, capped).tier).toBe("push"); // you must know about a deadline
  });
});

describe("inQuietHours · wrap-around", () => {
  it("handles a window that crosses midnight (21→8)", () => {
    const q = DEFAULT_QUIET_HOURS;
    expect(inQuietHours(22, q)).toBe(true);
    expect(inQuietHours(3, q)).toBe(true);
    expect(inQuietHours(7, q)).toBe(true);
    expect(inQuietHours(8, q)).toBe(false);
    expect(inQuietHours(14, q)).toBe(false);
    expect(inQuietHours(20, q)).toBe(false);
  });
});
