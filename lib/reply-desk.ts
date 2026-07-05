/**
 * Reply desk (slice X9, docs/specs/x9-reply-desk.md) — pure assembly of the
 * threads that are *waiting on the user*, ranked by urgency, each ready to carry
 * a drafted response. The Gate-2 layer already reads recruiter mail + calendar
 * and drafts replies on demand; this turns that reactive, per-thread work into
 * one ranked desk: scheduling asks get real conflict-free calendar slots, and
 * overdue follow-ups / interview thank-yous surface as queued drafts.
 *
 * The room DRAFTS; it never sends. The key invariant lives in the data: every
 * assembled row has `sendable: false` — a row carries a draft to review, never
 * an authorization to send. Sending stays the user's own click through the
 * existing Gate-2 you-send path. No model calls in this module.
 */

/** Categories from agent/skills/gate2/classify_recruiter. */
export type RecruiterCategory =
  | "intro"
  | "screening"
  | "scheduling"
  | "comp"
  | "status"
  | "rejection"
  | "offer"
  | "other";

export interface DeskEmail {
  id: string;
  from: string;
  subject: string;
  date: string; // RFC2822 / ISO from the mail header
  body: string;
  category: RecruiterCategory;
  needsReply: boolean;
}

export interface DeskCalEvent {
  start: string; // ISO
  end: string; // ISO
}

export interface DeskRole {
  id: string;
  company: string;
  role_title: string;
}

/** SLA-engine-derived nudges: an overdue follow-up or a post-interview thank-you window. */
export interface DeskSignal {
  id: string;
  kind: "followup_overdue" | "thankyou";
  roleId: string | null;
  /** Human label ("No reply in 6 days", "Interview was Tuesday"). */
  label: string;
  /** ISO — when it came due; used for ordering. */
  dueAt: string;
}

export type DeskReason = "scheduling" | "question" | "followup_overdue" | "thankyou";

export interface DeskRow {
  id: string;
  source: "email" | "signal";
  reason: DeskReason;
  /** Who/what the row is about. */
  from: string;
  subject: string;
  /** First line of the inbound, for the card. */
  snippet: string;
  /** Fuller inbound text, passed to draft_reply so the drafted reply is grounded. */
  inbound: string;
  /** ISO of the thing we're responding to — oldest waiting sorts first. */
  waitingSince: string;
  /** Linked tracker context when we can match it; null when we can't. */
  roleId: string | null;
  company: string | null;
  title: string | null;
  /** Only scheduling rows carry proposed times; always conflict-free. */
  proposedSlots: string[];
  /** For the client's draft call: the classification passed straight to draft_reply. */
  classification: { category: RecruiterCategory } | null;
  /** INVARIANT: assembled rows are never sendable — the desk drafts, the human sends. */
  sendable: false;
}

export interface SlotPrefs {
  workStartHour: number; // inclusive, local-to-offset
  workEndHour: number; // exclusive
  count: number;
  horizonDays: number; // calendar days to look ahead
  slotMinutes: number;
  /** Minutes to add to UTC to reach the user's local time (e.g. IST +330). */
  tzOffsetMinutes: number;
}

export const DEFAULT_SLOT_PREFS: SlotPrefs = {
  workStartHour: 9,
  workEndHour: 17,
  count: 3,
  horizonDays: 5,
  slotMinutes: 30,
  tzOffsetMinutes: 0,
};

/** Categories the desk acts on. rejection→X11, offer→its own flow, other→ignored. */
const DESK_CATEGORIES: ReadonlySet<RecruiterCategory> = new Set([
  "scheduling",
  "screening",
  "comp",
  "status",
  "intro",
]);

/** Lower = more urgent; ties broken by oldest-waiting-first. */
const REASON_RANK: Record<DeskReason, number> = {
  followup_overdue: 0,
  scheduling: 1,
  question: 2,
  thankyou: 3,
};

function snippetOf(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 140);
}

/** Best-effort link of an inbound to a tracked role by company name in the sender. */
function linkRole(from: string, roles: DeskRole[]): DeskRole | null {
  const hay = from.toLowerCase();
  // Longest company name first, so "Acme Robotics" beats a stray "Acme".
  const sorted = [...roles].sort((a, b) => b.company.length - a.company.length);
  for (const r of sorted) {
    const c = r.company.trim().toLowerCase();
    if (c.length >= 3 && hay.includes(c)) return r;
  }
  return null;
}

/**
 * Conflict-free candidate times: business-day slots inside working hours, from
 * `now` forward, skipping any that overlap a real calendar event. Pure over the
 * fetched calendar and an explicit `nowIso` (no ambient clock — deterministic).
 */
export function proposeSlots(
  calendar: DeskCalEvent[],
  prefs: SlotPrefs,
  nowIso: string,
): string[] {
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) return [];
  const busy = calendar
    .map((e) => [Date.parse(e.start), Date.parse(e.end)] as const)
    .filter(([s, e]) => !Number.isNaN(s) && !Number.isNaN(e) && e > s);
  const offMs = prefs.tzOffsetMinutes * 60_000;
  const slotMs = prefs.slotMinutes * 60_000;
  const out: string[] = [];

  for (let day = 0; day < prefs.horizonDays && out.length < prefs.count; day++) {
    // Work in the user's local frame by shifting into an offset-adjusted clock.
    const localBase = new Date(now + offMs);
    const localDay = new Date(
      Date.UTC(localBase.getUTCFullYear(), localBase.getUTCMonth(), localBase.getUTCDate() + day),
    );
    const dow = localDay.getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekends off

    for (let hour = prefs.workStartHour; hour < prefs.workEndHour && out.length < prefs.count; hour++) {
      // local slot start → back to real UTC epoch
      const localStart = Date.UTC(
        localDay.getUTCFullYear(),
        localDay.getUTCMonth(),
        localDay.getUTCDate(),
        hour,
      );
      const startEpoch = localStart - offMs;
      const endEpoch = startEpoch + slotMs;
      if (startEpoch <= now) continue; // no past times
      const clashes = busy.some(([s, e]) => startEpoch < e && endEpoch > s);
      if (clashes) continue;
      out.push(new Date(startEpoch).toISOString());
    }
  }
  return out;
}

/**
 * Assemble the ranked desk. Emails contribute a row only when they're waiting on
 * the user (`needsReply`) and in an actionable category; SLA signals contribute
 * follow-up / thank-you rows. Every row is `sendable: false`.
 */
export function assembleDesk(
  emails: DeskEmail[],
  calendar: DeskCalEvent[],
  roles: DeskRole[],
  signals: DeskSignal[],
  nowIso: string,
  prefs: SlotPrefs = DEFAULT_SLOT_PREFS,
): DeskRow[] {
  const rows: DeskRow[] = [];

  for (const e of emails) {
    if (!e.needsReply || !DESK_CATEGORIES.has(e.category)) continue;
    const reason: DeskReason = e.category === "scheduling" ? "scheduling" : "question";
    const role = linkRole(e.from, roles);
    rows.push({
      id: `email:${e.id}`,
      source: "email",
      reason,
      from: e.from,
      subject: e.subject,
      snippet: snippetOf(e.body),
      inbound: e.body.slice(0, 2000),
      waitingSince: e.date,
      roleId: role?.id ?? null,
      company: role?.company ?? null,
      title: role?.role_title ?? null,
      proposedSlots: reason === "scheduling" ? proposeSlots(calendar, prefs, nowIso) : [],
      classification: { category: e.category },
      sendable: false,
    });
  }

  const rolesById = new Map(roles.map((r) => [r.id, r]));
  for (const s of signals) {
    const role = s.roleId ? rolesById.get(s.roleId) ?? null : null;
    rows.push({
      id: `signal:${s.id}`,
      source: "signal",
      reason: s.kind,
      from: role ? `${role.company} · ${role.role_title}` : s.label,
      subject: s.label,
      snippet: s.label,
      inbound: "",
      waitingSince: s.dueAt,
      roleId: role?.id ?? null,
      company: role?.company ?? null,
      title: role?.role_title ?? null,
      proposedSlots: [],
      classification: null,
      sendable: false,
    });
  }

  return rows.sort((a, b) => {
    const r = REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (r !== 0) return r;
    return a.waitingSince.localeCompare(b.waitingSince); // oldest waiting first
  });
}
