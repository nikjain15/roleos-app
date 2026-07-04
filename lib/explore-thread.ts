/**
 * Anon Explore conversation persistence (slice W6). The Ask-RO thread survives
 * page loads via localStorage — pure parse/serialize here so the storage format
 * is validated and unit-tested (corrupted/hostile storage must never crash the
 * page or inject non-string content into the UI).
 *
 * Privacy: the thread lives ONLY in the visitor's browser. Nothing is written
 * server-side for anon users; the clear button wipes it instantly.
 */

export interface CitedRole {
  id: string;
  company: string;
  role_title: string;
}

export interface AskTurn {
  q: string;
  a: string;
  cited: CitedRole[];
  followups: string[];
}

export const THREAD_STORAGE_KEY = "ro-explore-thread-v1";
export const THREAD_MAX_TURNS = 12;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

/** Parse a stored thread. Anything malformed → dropped; never throws. */
export function parseThread(raw: string | null | undefined): AskTurn[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const turns: AskTurn[] = [];
    for (const t of data) {
      if (!t || typeof t !== "object") continue;
      const o = t as Record<string, unknown>;
      const q = str(o.q, 500);
      const a = str(o.a, 8000);
      if (!q || !a) continue;
      const cited: CitedRole[] = Array.isArray(o.cited)
        ? (o.cited as unknown[])
            .map((c) => {
              const co = (c ?? {}) as Record<string, unknown>;
              const id = str(co.id, 60);
              const company = str(co.company, 120);
              const role_title = str(co.role_title, 200);
              return id && company && role_title ? { id, company, role_title } : null;
            })
            .filter((c): c is CitedRole => c !== null)
            .slice(0, 10)
        : [];
      const followups = Array.isArray(o.followups)
        ? (o.followups as unknown[]).map((f) => str(f, 200)).filter((f): f is string => f !== null).slice(0, 5)
        : [];
      turns.push({ q, a, cited, followups });
    }
    return turns.slice(-THREAD_MAX_TURNS);
  } catch {
    return [];
  }
}

/** Serialize for storage, keeping only the newest turns. */
export function serializeThread(turns: AskTurn[]): string {
  return JSON.stringify(turns.slice(-THREAD_MAX_TURNS));
}
