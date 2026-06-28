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

// ── Apify: run an actor synchronously and read its dataset items ─────────────
// POST .../acts/<actor>/run-sync-get-dataset-items?token=… → array of items.
function apifyFetcher(token: string, actor: string): ProfileFetcher {
  return {
    name: "apify",
    async fetchProfileText(url: string): Promise<string> {
      const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(
        actor,
      )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Common actor input keys; harmless extras are ignored by the actor.
        body: JSON.stringify({ profileUrls: [url], urls: [url], startUrls: [{ url }] }),
      });
      if (!res.ok) throw new Error(`apify ${res.status}`);
      const items = (await res.json()) as unknown;
      const first = Array.isArray(items) ? items[0] : items;
      if (!first || typeof first !== "object") throw new Error("apify: empty result");
      return profileObjectToText(first as Record<string, unknown>);
    },
  };
}

// ── Bright Data: trigger a dataset snapshot, poll until ready ────────────────
function brightDataFetcher(token: string, datasetId: string): ProfileFetcher {
  return {
    name: "brightdata",
    async fetchProfileText(url: string): Promise<string> {
      const trigger = await fetch(
        `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${encodeURIComponent(
          datasetId,
        )}&include_errors=true`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify([{ url }]),
        },
      );
      if (!trigger.ok) throw new Error(`brightdata trigger ${trigger.status}`);
      const { snapshot_id } = (await trigger.json()) as { snapshot_id?: string };
      if (!snapshot_id) throw new Error("brightdata: no snapshot_id");

      // Bounded poll (the onboard request has a 60s ceiling).
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        const snap = await fetch(
          `https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}?format=json`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (snap.status === 202) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (!snap.ok) throw new Error(`brightdata snapshot ${snap.status}`);
        const data = (await snap.json()) as unknown;
        const first = Array.isArray(data) ? data[0] : data;
        if (!first || typeof first !== "object") throw new Error("brightdata: empty result");
        return profileObjectToText(first as Record<string, unknown>);
      }
      throw new Error("brightdata: timed out");
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
