import { env } from "@/lib/env";
import { normalizeProfileText } from "@/lib/normalize-profile";

/**
 * URL → profile-text fetcher (the optional, swappable scraper layer).
 *
 * IMPORTANT context (architecture + the user's own caution):
 *  - This is the LAST-RESORT intake path. The primary, ToS-clean paths are paste
 *    and PDF upload. Scraping LinkedIn is against their ToS regardless of whose
 *    profile it is (Proxycurl was sued + shut down in 2025) — so this is OFF by
 *    default, only switches on when a provider key is configured, and is one
 *    `ProfileFetcher` away from swapping or removing the vendor entirely.
 *  - It is an inbound READ of a public URL the user pasted — NOT an outward send
 *    of the user's drafts. The human-gated-outward invariant (no send tool in the
 *    agent layer) is untouched; this lives in lib/, called by the onboard route.
 *
 * The two adapters target each provider's documented API shape. They are written
 * but UNVERIFIED against a live account (no key yet) — verify the request/response
 * mapping the first time a key is added. The interface + the off-by-default
 * integration are what's verified now.
 */

export interface ProfileFetcher {
  readonly name: string;
  /** Fetch a LinkedIn profile URL → readable, normalized profile text. */
  fetchProfileText(linkedinUrl: string): Promise<string>;
}

const LINKEDIN_PROFILE_RE = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^/\s?#]+/i;

/** Pull a LinkedIn /in/ profile URL out of an input, if present. */
export function extractLinkedInUrl(text: string): string | null {
  const m = text.match(LINKEDIN_PROFILE_RE);
  return m ? m[0] : null;
}

/**
 * Flatten an arbitrary scraper JSON object into readable text. Actor/dataset
 * schemas differ per provider, so we pull the fields that matter when present
 * and fall back to a shallow stringify — then normalize. Robust to shape drift.
 */
function profileObjectToText(o: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (label: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(`${label}: ${v.trim()}`);
  };
  push("Name", o.fullName ?? o.name ?? `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim());
  push("Headline", o.headline ?? o.occupation ?? o.subtitle);
  push("Location", o.location ?? o.locationName ?? o.geo);
  push("About", o.summary ?? o.about ?? o.bio);

  const exp = (o.experience ?? o.positions ?? o.experiences) as unknown[] | undefined;
  if (Array.isArray(exp) && exp.length) {
    parts.push("Experience:");
    for (const e of exp.slice(0, 12)) {
      const x = e as Record<string, unknown>;
      const title = x.title ?? x.role ?? x.position ?? "";
      const company = x.company ?? x.companyName ?? x.organisation ?? "";
      const dates = x.dateRange ?? x.duration ?? x.period ?? "";
      const desc = x.description ?? x.summary ?? "";
      parts.push(`- ${title}${company ? ` @ ${company}` : ""}${dates ? ` (${dates})` : ""}`);
      if (typeof desc === "string" && desc.trim()) parts.push(`  ${desc.trim()}`);
    }
  }
  const edu = (o.education ?? o.educations) as unknown[] | undefined;
  if (Array.isArray(edu) && edu.length) {
    parts.push("Education:");
    for (const e of edu.slice(0, 6)) {
      const x = e as Record<string, unknown>;
      parts.push(`- ${x.title ?? x.schoolName ?? x.school ?? ""} ${x.degree ?? x.fieldOfStudy ?? ""}`.trim());
    }
  }
  const skills = (o.skills ?? o.skillsList) as unknown[] | undefined;
  if (Array.isArray(skills) && skills.length) {
    const names = skills
      .map((s) => (typeof s === "string" ? s : (s as Record<string, unknown>).name))
      .filter((s): s is string => typeof s === "string");
    if (names.length) parts.push(`Skills: ${names.slice(0, 40).join(", ")}`);
  }

  const text = parts.length ? parts.join("\n") : JSON.stringify(o);
  return normalizeProfileText(text);
}

/**
 * Map the apimaestro/linkedin-profile-detail actor's nested shape (verified live):
 * { basic_info{ fullname, headline, location{full}, current_company, about,
 * top_skills }, experience[]{title,company,duration,description},
 * education[]{school,degree,duration} }. Returns null if it isn't that shape so
 * the caller can fall back to the generic flattener.
 */
function apimaestroProfileToText(item: Record<string, unknown>): string | null {
  const b = item.basic_info as Record<string, unknown> | undefined;
  if (!b || typeof b !== "object") return null;
  const parts: string[] = [];
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (s(b.fullname)) parts.push(`Name: ${s(b.fullname)}`);
  if (s(b.headline)) parts.push(`Headline: ${s(b.headline)}`);
  const loc = b.location as { full?: string } | string | undefined;
  const locStr = typeof loc === "string" ? loc : loc?.full;
  if (locStr) parts.push(`Location: ${locStr}`);
  if (s(b.current_company)) parts.push(`Current company: ${s(b.current_company)}`);
  if (s(b.about)) parts.push(`About: ${s(b.about)}`);
  const skills = b.top_skills;
  if (Array.isArray(skills) && skills.length) parts.push(`Top skills: ${skills.join(", ")}`);
  else if (s(skills)) parts.push(`Top skills: ${s(skills)}`);

  const exp = item.experience as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(exp) && exp.length) {
    parts.push("Experience:");
    for (const e of exp.slice(0, 12)) {
      parts.push(
        `- ${s(e.title)}${s(e.company) ? ` @ ${s(e.company)}` : ""}${s(e.duration) ? ` (${s(e.duration)})` : ""}`,
      );
      if (s(e.description)) parts.push(`  ${s(e.description)}`);
    }
  }
  const edu = item.education as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(edu) && edu.length) {
    parts.push("Education:");
    for (const e of edu.slice(0, 6)) parts.push(`- ${s(e.school)} — ${s(e.degree)}`.trim());
  }
  return parts.length > 1 ? parts.join("\n") : null;
}

// ── Apify: run an actor synchronously and read its dataset items ─────────────
// POST .../acts/<actor>/run-sync-get-dataset-items?token=… → array of items.
// Default actor: apimaestro/linkedin-profile-detail (verified live).
function apifyFetcher(token: string, actor: string): ProfileFetcher {
  return {
    name: "apify",
    async fetchProfileText(url: string): Promise<string> {
      const actorPath = actor.replace("/", "~"); // Apify API form: username~actor
      const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(
        actorPath,
      )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // apimaestro takes `username` (a profile URL or handle); extras are ignored.
        body: JSON.stringify({ username: url, profileUrl: url, url }),
      });
      if (!res.ok) throw new Error(`apify ${res.status}`);
      const items = (await res.json()) as unknown;
      const first = Array.isArray(items) ? items[0] : items;
      if (!first || typeof first !== "object") throw new Error("apify: empty result");
      const obj = first as Record<string, unknown>;
      const text = apimaestroProfileToText(obj) ?? profileObjectToText(obj);
      return normalizeProfileText(text);
    },
  };
}

// ── Bright Data: synchronous /scrape (real-time) — results in the response ───
// POST .../datasets/v3/scrape?dataset_id=… body {"input":[{"url":…}]}.
// (NOTE: requires an ACTIVE Bright Data account; an inactive one returns
//  "Customer is not active". Response shape mapped via the generic flattener —
//  verify the field mapping the first time it runs on a live account.)
function brightDataFetcher(token: string, datasetId: string): ProfileFetcher {
  return {
    name: "brightdata",
    async fetchProfileText(url: string): Promise<string> {
      const res = await fetch(
        `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${encodeURIComponent(
          datasetId,
        )}&notify=false&include_errors=true`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ input: [{ url }] }),
        },
      );
      if (!res.ok) throw new Error(`brightdata ${res.status}`);
      const data = (await res.json()) as unknown;
      const first = Array.isArray(data) ? data[0] : data;
      if (!first || typeof first !== "object") throw new Error("brightdata: empty result");
      return normalizeProfileText(profileObjectToText(first as Record<string, unknown>));
    },
  };
}

/**
 * The configured fetcher, or null when no provider key is set (feature off).
 * Apify wins if both are configured (simpler sync API; the recommended default).
 */
export function getProfileFetcher(): ProfileFetcher | null {
  const e = env();
  if (e.APIFY_TOKEN && e.APIFY_LINKEDIN_ACTOR) {
    return apifyFetcher(e.APIFY_TOKEN, e.APIFY_LINKEDIN_ACTOR);
  }
  if (e.BRIGHTDATA_TOKEN && e.BRIGHTDATA_DATASET_ID) {
    return brightDataFetcher(e.BRIGHTDATA_TOKEN, e.BRIGHTDATA_DATASET_ID);
  }
  return null;
}
