/**
 * Roles Workspace sort + filter (Slice 5). Pure, dependency-free so the curation
 * logic is unit-tested and shared by the server page and the client board. Reads
 * the already-reasoned matches — no new model call (re-ranking is local; a full
 * re-match is the separate explicit refresh).
 */

export type Verdict = "pursue" | "maybe" | "skip" | "unknown";
export type SortKey = "fit" | "recency" | "verdict";

export interface WorkspaceRole {
  role_id: string;
  fit: number | null;
  verdict: Verdict;
  company: string;
  title: string;
  location: string | null;
  remote: boolean;
  url: string | null;
  why: string | null;
  gaps: string[];
  status: string; // new | saved | pursuing | dismissed
  created_at: string;
  /** Role must-haves flattened to text (P1 compare). */
  mustHaves: string[];
  /** The user's private note on this role (P1 notes), null if none. */
  note: string | null;
}

/** Flatten a roles.must_haves jsonb entry (seed = objects, ats = strings) to text. */
export function mhTexts(must_haves: unknown, cap = 6): string[] {
  if (!Array.isArray(must_haves)) return [];
  return (must_haves as unknown[]).slice(0, cap).map((v) => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return String(o.raw_text_from_jd ?? o.text ?? o.requirement ?? "");
    }
    return String(v);
  }).filter((t) => t.length > 0);
}

/** Toggle a role in the compare selection, capped (P1: compare 2–3). */
export function toggleCompare(selected: string[], roleId: string, max = 3): string[] {
  if (selected.includes(roleId)) return selected.filter((id) => id !== roleId);
  if (selected.length >= max) return selected;
  return [...selected, roleId];
}

export interface WorkspaceFilters {
  verdict?: Verdict | "all";
  company?: string; // free-text, case-insensitive substring
  location?: string; // free-text
  remoteOnly?: boolean;
}

const VERDICT_RANK: Record<Verdict, number> = { pursue: 3, maybe: 2, skip: 1, unknown: 0 };

/** Normalize the stored recommendation string into a verdict. */
export function toVerdict(rec: string | null | undefined): Verdict {
  const r = (rec ?? "").toLowerCase();
  if (r.includes("pursue")) return "pursue";
  if (r.includes("maybe")) return "maybe";
  if (r.includes("skip")) return "skip";
  return "unknown";
}

/** roles.location is jsonb — flatten to display text + a remote flag. */
export function locationText(loc: unknown): { text: string | null; remote: boolean } {
  if (!loc) return { text: null, remote: false };
  if (typeof loc === "string") return { text: loc, remote: /remote/i.test(loc) };
  if (typeof loc === "object") {
    const o = loc as Record<string, unknown>;
    const parts = [o.city, o.region, o.country].filter((x): x is string => typeof x === "string");
    const remote = o.remote === true || parts.some((p) => /remote/i.test(p));
    const text = (typeof o.text === "string" && o.text) || parts.join(", ") || (remote ? "Remote" : null);
    return { text: text || null, remote };
  }
  return { text: null, remote: false };
}

export function filterRoles(rows: WorkspaceRole[], f: WorkspaceFilters): WorkspaceRole[] {
  const company = f.company?.trim().toLowerCase();
  const location = f.location?.trim().toLowerCase();
  return rows.filter((r) => {
    if (r.status === "dismissed") return false;
    if (f.verdict && f.verdict !== "all" && r.verdict !== f.verdict) return false;
    if (company && !r.company.toLowerCase().includes(company)) return false;
    if (location && !(r.location ?? "").toLowerCase().includes(location)) return false;
    if (f.remoteOnly && !r.remote) return false;
    return true;
  });
}

export function sortRoles(rows: WorkspaceRole[], key: SortKey): WorkspaceRole[] {
  const out = [...rows];
  switch (key) {
    case "fit":
      out.sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1));
      break;
    case "recency":
      out.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case "verdict":
      out.sort((a, b) => VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict] || (b.fit ?? -1) - (a.fit ?? -1));
      break;
  }
  return out;
}

export function curate(rows: WorkspaceRole[], key: SortKey, f: WorkspaceFilters): WorkspaceRole[] {
  return sortRoles(filterRoles(rows, f), key);
}
