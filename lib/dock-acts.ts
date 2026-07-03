import type { SortKey, Verdict, WorkspaceFilters } from "@/lib/workspace";

/**
 * RO-dock act-verbs (slice W3) — pure helpers shared by the dock API (server)
 * and the Roles workspace (client). Two verbs beyond navigation:
 *
 *   • filter-this-view — RO proposes a sanitized `/roles?…` link; clicking it
 *     applies the filters IN PLACE (the workspace reads the URL params).
 *   • tailor — RO proposes tailoring the résumé for ONE of the user's own
 *     pursue-matches; the dock runs /api/tailor ONLY when the user clicks.
 *
 * Still human-gated, still no transport: every act is a proposal the user
 * clicks; the server validates everything the model suggests (never trust a
 * model-supplied id or param — same defense-in-depth as the href whitelist).
 */

export interface TailorAct {
  kind: "tailor";
  roleId: string;
  label: string;
}

export interface FilterAct {
  kind: "filter";
  href: string; // sanitized /roles?… link
  label: string;
}

export type DockAct = TailorAct | FilterAct;

/** What the model may propose (untrusted until validated). */
export interface RawAct {
  kind?: unknown;
  roleId?: unknown;
  verdict?: unknown;
  company?: unknown;
  location?: unknown;
  remote?: unknown;
  sort?: unknown;
  label?: unknown;
}

const VERDICTS = new Set(["pursue", "maybe", "skip", "all"]);
const SORTS = new Set(["fit", "recency", "verdict"]);
const FREE_TEXT_MAX = 60;

const cleanText = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, FREE_TEXT_MAX);
  return t.length > 0 ? t : null;
};

/** Build the sanitized /roles?… href for a filter act. Whitelisted params only. */
export function buildFilterHref(f: {
  verdict?: unknown;
  company?: unknown;
  location?: unknown;
  remote?: unknown;
  sort?: unknown;
}): string {
  const p = new URLSearchParams();
  if (typeof f.verdict === "string" && VERDICTS.has(f.verdict) && f.verdict !== "all") p.set("verdict", f.verdict);
  const company = cleanText(f.company);
  if (company) p.set("company", company);
  const location = cleanText(f.location);
  if (location) p.set("location", location);
  if (f.remote === true || f.remote === "1" || f.remote === "true") p.set("remote", "1");
  if (typeof f.sort === "string" && SORTS.has(f.sort)) p.set("sort", f.sort);
  const qs = p.toString();
  return qs ? `/roles?${qs}` : "/roles";
}

/**
 * Validate a model-proposed act. `allowedRoleIds` is the user's OWN candidate
 * set (from their RLS-scoped matches) — a tailor act naming any other id is
 * dropped, so a prompt-injected "tailor role X" can never reach a foreign row.
 */
export function validateAct(
  raw: RawAct | null | undefined,
  allowedRoles: Array<{ id: string; company: string; title: string }>,
): DockAct | null {
  if (!raw || typeof raw !== "object") return null;

  if (raw.kind === "tailor") {
    const role = allowedRoles.find((r) => r.id === raw.roleId);
    if (!role) return null;
    return {
      kind: "tailor",
      roleId: role.id,
      // Label built server-side from OUR data, never from the model's string.
      label: `Tailor my résumé — ${role.title} at ${role.company}`.slice(0, 80),
    };
  }

  if (raw.kind === "filter") {
    const href = buildFilterHref(raw);
    const label = cleanText(raw.label) ?? "Filter my roles view";
    return { kind: "filter", href, label: label.slice(0, 60) };
  }

  return null;
}

/** Parse /roles URL search params into workspace state (the in-place half). */
export function parseWorkspaceParams(params: URLSearchParams): {
  filters: WorkspaceFilters;
  sort: SortKey | null;
} {
  const v = params.get("verdict");
  const verdict = v && VERDICTS.has(v) ? (v as Verdict | "all") : undefined;
  const sortRaw = params.get("sort");
  const sort = sortRaw && SORTS.has(sortRaw) ? (sortRaw as SortKey) : null;
  return {
    filters: {
      verdict,
      company: cleanText(params.get("company")) ?? undefined,
      location: cleanText(params.get("location")) ?? undefined,
      remoteOnly: params.get("remote") === "1" ? true : undefined,
    },
    sort,
  };
}
