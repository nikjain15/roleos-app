import { describe, it, expect } from "vitest";
import {
  assembleDesk,
  proposeSlots,
  DEFAULT_SLOT_PREFS,
  type DeskEmail,
  type DeskRole,
  type DeskSignal,
  type DeskCalEvent,
} from "@/lib/reply-desk";

const NOW = "2026-07-06T06:00:00.000Z"; // a Monday, 06:00 UTC

function email(over: Partial<DeskEmail> & Pick<DeskEmail, "id">): DeskEmail {
  return {
    from: "Jane at Acme <jane@acme.com>",
    subject: "Re: Senior PM",
    date: "2026-07-05T10:00:00.000Z",
    body: "Thanks — could you share some times next week?",
    category: "scheduling",
    needsReply: true,
    ...over,
  };
}

const ROLES: DeskRole[] = [{ id: "r1", company: "Acme", role_title: "Senior PM" }];

describe("assembleDesk", () => {
  it("only rows waiting on the user (needsReply) in actionable categories appear", () => {
    const rows = assembleDesk(
      [
        email({ id: "a", needsReply: false }), // already replied → out
        email({ id: "b", category: "rejection" }), // rejection → X11, not the desk
        email({ id: "c", category: "offer" }), // offer → own flow
        email({ id: "d", category: "other" }), // noise
        email({ id: "e", category: "screening" }), // question → in
      ],
      [],
      ROLES,
      [],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["email:e"]);
  });

  it("every assembled row is sendable:false — the desk drafts, never sends", () => {
    const rows = assembleDesk(
      [email({ id: "a" }), email({ id: "b", category: "screening" })],
      [],
      ROLES,
      [{ id: "s1", kind: "thankyou", roleId: "r1", label: "Interview was Tuesday", dueAt: NOW }],
      NOW,
    );
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.sendable === false)).toBe(true);
  });

  it("ranks followup_overdue → scheduling → question → thankyou, oldest-waiting first within a tier", () => {
    const rows = assembleDesk(
      [
        email({ id: "q-new", category: "screening", date: "2026-07-05T12:00:00.000Z" }),
        email({ id: "sched", category: "scheduling", date: "2026-07-05T09:00:00.000Z" }),
        email({ id: "q-old", category: "screening", date: "2026-07-04T09:00:00.000Z" }),
      ],
      [],
      ROLES,
      [
        { id: "od", kind: "followup_overdue", roleId: "r1", label: "6 days quiet", dueAt: NOW },
        { id: "ty", kind: "thankyou", roleId: "r1", label: "thanks window", dueAt: NOW },
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "signal:od", // followup_overdue
      "email:sched", // scheduling
      "email:q-old", // question, oldest first
      "email:q-new",
      "signal:ty", // thankyou last
    ]);
  });

  it("links an inbound to a tracked role by company name in the sender", () => {
    const [row] = assembleDesk([email({ id: "a" })], [], ROLES, [], NOW);
    expect(row.roleId).toBe("r1");
    expect(row.company).toBe("Acme");
    expect(row.title).toBe("Senior PM");
  });

  it("unlinked inbound still shows (roleId null), never dropped for lack of a match", () => {
    const [row] = assembleDesk(
      [email({ id: "a", from: "recruiter@unknownco.io" })],
      [],
      ROLES,
      [],
      NOW,
    );
    expect(row.roleId).toBeNull();
    expect(row.reason).toBe("scheduling");
  });

  it("only scheduling rows carry proposed slots; questions carry none", () => {
    const rows = assembleDesk(
      [email({ id: "sched", category: "scheduling" }), email({ id: "q", category: "screening" })],
      [],
      ROLES,
      [],
      NOW,
    );
    const sched = rows.find((r) => r.id === "email:sched")!;
    const q = rows.find((r) => r.id === "email:q")!;
    expect(sched.proposedSlots.length).toBeGreaterThan(0);
    expect(q.proposedSlots).toEqual([]);
  });
});

describe("proposeSlots", () => {
  it("offers conflict-free, working-hours, future slots and honors count", () => {
    const slots = proposeSlots([], DEFAULT_SLOT_PREFS, NOW);
    expect(slots.length).toBe(3);
    for (const iso of slots) {
      const t = Date.parse(iso);
      expect(t).toBeGreaterThan(Date.parse(NOW));
      const hour = new Date(t).getUTCHours(); // tzOffset 0 in defaults
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(17);
    }
  });

  it("never proposes a slot that overlaps a real calendar event", () => {
    // Block the whole first working day.
    const busy: DeskCalEvent[] = [
      { start: "2026-07-06T09:00:00.000Z", end: "2026-07-06T17:00:00.000Z" },
    ];
    const slots = proposeSlots(busy, DEFAULT_SLOT_PREFS, NOW);
    for (const iso of slots) {
      const d = new Date(iso);
      // must have skipped Monday the 6th entirely
      expect(d.getUTCDate()).not.toBe(6);
    }
    expect(slots.length).toBe(3);
  });

  it("skips weekends", () => {
    // Friday 2026-07-10 18:00 → next slot must be Monday the 13th, not the weekend.
    const slots = proposeSlots([], { ...DEFAULT_SLOT_PREFS, count: 1 }, "2026-07-10T18:00:00.000Z");
    expect(new Date(slots[0]).getUTCDate()).toBe(13);
  });

  it("returns [] for an unparseable now", () => {
    expect(proposeSlots([], DEFAULT_SLOT_PREFS, "not-a-date")).toEqual([]);
  });
});
