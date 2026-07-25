import { env } from "@/lib/env";
import { normalizeProfileText } from "@/lib/normalize-profile";

/**
 * GitHub → profile-text reader (the free, ToS-clean counterpart to the LinkedIn
 * scraper in lib/profile-fetcher).
 *
 * WHY this is different from LinkedIn: GitHub's public REST API is official,
 * free, and explicitly public — none of the ToS/scraping baggage. So unlike the
 * LinkedIn path (off by default, paid vendor, one URL the user pasted), this can
 * always run on public data. For a builder audience (senior AI/PM who ship), a
 * candidate's repos are high signal: what they've actually built, in what
 * languages, and their own README self-description.
 *
 * It is an inbound READ of public URLs the user pasted — NOT an outward send.
 * The human-gated-outward invariant is untouched; this lives in lib/, called by
 * the onboard route.
 *
 * Token-optional: anonymous is 60 req/hr per IP (fine for a demo); a GITHUB_TOKEN
 * (any read-only PAT — we only hit public endpoints) lifts it to 5,000/hr.
 */

// Scheme is optional — people paste "github.com/handle" as often as the full URL.
const GITHUB_URL_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)(?:\/[^\s?#]*)?/i;

// Paths that are org/product sections, not user handles — don't treat as a profile.
const RESERVED_HANDLES = new Set([
  "orgs", "features", "topics", "collections", "trending", "marketplace",
  "sponsors", "settings", "notifications", "explore", "about", "pricing",
  "login", "join", "search", "apps", "customer-stories",
]);

/** Pull a github.com/<handle> out of an input, if present (ignores reserved paths). */
export function extractGitHubUrl(text: string): string | null {
  const m = text.match(GITHUB_URL_RE);
  if (!m) return null;
  const handle = m[1];
  if (RESERVED_HANDLES.has(handle.toLowerCase())) return null;
  return `https://github.com/${handle}`;
}

/** The bare handle from a github URL or a raw "@handle"/"handle" string. */
export function githubHandle(input: string): string | null {
  const fromUrl = input.match(GITHUB_URL_RE);
  if (fromUrl && !RESERVED_HANDLES.has(fromUrl[1].toLowerCase())) return fromUrl[1];
  const bare = input.trim().replace(/^@/, "");
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(bare) && !RESERVED_HANDLES.has(bare.toLowerCase())) {
    return bare;
  }
  return null;
}

interface GitHubUser {
  name?: string | null;
  login?: string;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
  followers?: number;
  public_repos?: number;
}

interface GitHubRepo {
  name: string;
  full_name?: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  fork?: boolean;
  archived?: boolean;
  updated_at?: string;
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RoleOS-onboarding",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = env().GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) return null; // 404 (no such user), 403 (rate limited) → treat as no data
  return (await res.json()) as T;
}

/** Fetch the user's profile README (the <handle>/<handle> repo) as raw markdown. */
async function fetchProfileReadme(handle: string): Promise<string | null> {
  const res = await fetch(`https://raw.githubusercontent.com/${handle}/${handle}/main/README.md`, {
    headers: { "User-Agent": "RoleOS-onboarding" },
  });
  if (res.ok) return res.text();
  const alt = await fetch(`https://raw.githubusercontent.com/${handle}/${handle}/master/README.md`, {
    headers: { "User-Agent": "RoleOS-onboarding" },
  });
  return alt.ok ? alt.text() : null;
}

/**
 * Read a public GitHub profile → readable, normalized profile text. Combines
 * cleanly with LinkedIn/CV/notes upstream. Returns "" when there's nothing
 * usable (unknown handle, empty account) so the caller can just skip it.
 */
export async function fetchGitHubProfileText(input: string): Promise<string> {
  const handle = githubHandle(input);
  if (!handle) return "";

  const user = await ghJson<GitHubUser>(`https://api.github.com/users/${handle}`);
  if (!user || !user.login) return "";

  // Top repos by stars — skip forks/archived, they're not "their work".
  const repos =
    (await ghJson<GitHubRepo[]>(
      `https://api.github.com/users/${handle}/repos?per_page=100&sort=pushed`,
    )) ?? [];
  const own = repos.filter((r) => !r.fork && !r.archived);
  const top = [...own].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0)).slice(0, 8);

  // Aggregate the languages they actually work in (by repo count).
  const langCount = new Map<string, number>();
  for (const r of own) if (r.language) langCount.set(r.language, (langCount.get(r.language) ?? 0) + 1);
  const langs = [...langCount.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l).slice(0, 10);

  const parts: string[] = ["GitHub profile:"];
  if (user.name) parts.push(`Name: ${user.name}`);
  parts.push(`Handle: @${user.login}`);
  if (user.bio) parts.push(`Bio: ${user.bio}`);
  if (user.company) parts.push(`Company: ${user.company}`);
  if (user.location) parts.push(`Location: ${user.location}`);
  if (typeof user.public_repos === "number") {
    parts.push(`Public repos: ${user.public_repos}${user.followers ? ` · ${user.followers} followers` : ""}`);
  }
  if (langs.length) parts.push(`Works in: ${langs.join(", ")}`);

  if (top.length) {
    parts.push("Notable repositories:");
    for (const r of top) {
      const star = r.stargazers_count ? ` ★${r.stargazers_count}` : "";
      const lang = r.language ? ` [${r.language}]` : "";
      parts.push(`- ${r.name}${lang}${star}${r.description ? ` — ${r.description}` : ""}`);
    }
  }

  // The profile README is often the richest self-description — include a trimmed cut.
  const readme = await fetchProfileReadme(handle);
  if (readme && readme.trim().length > 40) {
    parts.push("Profile README:");
    parts.push(readme.trim().slice(0, 2500));
  }

  // Nothing beyond the handle line? Not worth returning.
  if (parts.length <= 2) return "";
  return normalizeProfileText(parts.join("\n"));
}
