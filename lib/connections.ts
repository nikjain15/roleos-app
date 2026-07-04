/**
 * Referral & warm-intro finder (slice X6 — approved sources A+D). Pure logic:
 * parse the user's OWN LinkedIn connections export (source A), normalize
 * company names, and rank warm paths into a pursued role's company. No model
 * calls here and ZERO external calls anywhere in the slice — the only people
 * data in the system is what the user explicitly handed us, owner-RLS'd and
 * deletable in one click.
 */

export interface ParsedConnection {
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
}

/** Hard cap per upload AND per user — a network list, not a data warehouse. */
export const CONNECTIONS_CAP = 5000;

/** Split one CSV line respecting double-quoted fields (RFC-4180 enough). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse a LinkedIn "Connections.csv" export. Tolerant of the notes preamble
 * LinkedIn prepends (we scan for the real header row), quoted commas, and
 * missing fields. Rows without a name are dropped; output is capped.
 */
export function parseConnectionsCsv(text: string, cap = CONNECTIONS_CAP): ParsedConnection[] {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /first name/i.test(l) && /last name/i.test(l));
  if (headerIdx === -1) return [];
  const header = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name);
  const first = col("first name");
  const last = col("last name");
  const company = col("company");
  const position = col("position");
  const email = col("email address");

  const out: ParsedConnection[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (out.length >= cap) break;
    if (!line.trim()) continue;
    const f = splitCsvLine(line);
    const name = [f[first], f[last]].filter(Boolean).join(" ").trim();
    if (!name) continue;
    out.push({
      name: name.slice(0, 200),
      company: (company >= 0 && f[company]?.trim() ? f[company].trim().slice(0, 200) : null) ?? null,
      title: (position >= 0 && f[position]?.trim() ? f[position].trim().slice(0, 200) : null) ?? null,
      email: (email >= 0 && f[email]?.trim() ? f[email].trim().slice(0, 200) : null) ?? null,
    });
  }
  return out;
}

/** Corporate suffixes that shouldn't break a match ("Acme, Inc." = "Acme"). */
const SUFFIXES = /\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|sa|ag|pbc|holdings)\b\.?/g;

export function normalizeCompany(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[.,'’]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same employer? Exact normalized match, or one contains the other (≥4 chars). */
export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 4 && long.includes(short);
}

/** Seniority read on a free-text title — senior contacts open more doors. */
export function titleRank(title: string | null | undefined): number {
  if (!title) return 0;
  const t = title.toLowerCase();
  if (/\b(founder|ceo|cto|coo|cpo|chief|vp|vice president|head of|director)\b/.test(t)) return 3;
  if (/\b(principal|staff|lead|senior manager|group)\b/.test(t)) return 2;
  if (/\b(senior|manager)\b/.test(t)) return 1;
  return 0;
}

export interface ConnectionRow {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  source: string;
  note: string;
}

export interface WarmPath {
  connection: ConnectionRow;
  /** Why this is a path — always shown to the user. */
  evidence: string;
}

/**
 * Warm paths into ONE company: direct employer matches only (v1 — honest
 * evidence beats fuzzy guesses). Ranked: hand-typed people first (the user
 * already decided they'd ask them), then title seniority, then name. Capped.
 */
export function warmPaths(connections: ConnectionRow[], company: string | null | undefined, cap = 5): WarmPath[] {
  if (!company) return [];
  return connections
    .filter((c) => sameCompany(c.company, company))
    .sort((a, b) => {
      const manual = Number(b.source === "manual") - Number(a.source === "manual");
      if (manual !== 0) return manual;
      const rank = titleRank(b.title) - titleRank(a.title);
      if (rank !== 0) return rank;
      return a.name.localeCompare(b.name);
    })
    .slice(0, cap)
    .map((c) => ({
      connection: c,
      evidence: `${c.name}${c.title ? ` — ${c.title}` : ""} · works at ${c.company} (${
        c.source === "manual" ? "you added them" : "your LinkedIn export"
      })`,
    }));
}
