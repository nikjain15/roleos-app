/**
 * User-added roles (paste a LinkedIn job → tailor a résumé against it).
 * Pure helpers for /api/roles/add — kept here so they're unit-testable.
 */

/** Max JD text we persist — matches the ingester's cap (lib/ingest/index.ts). */
export const USER_ROLE_DESCRIPTION_MAX = 8000;

/**
 * Normalize a pasted job URL. People paste LinkedIn links straight from the
 * feed, which means tracking params (`refId`, `trackingId`, `eventId`, utm_*)
 * and often no scheme. Canonical LinkedIn job form is
 * `https://www.linkedin.com/jobs/view/<id>/` — collapse to that so the same
 * posting pasted twice dedupes on `roles.url`. Search-page URLs carry the job
 * in `currentJobId`. Non-LinkedIn http(s) URLs pass through with only the
 * scheme defaulted; anything unparseable returns null.
 */
export function normalizeJobUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  if (/(^|\.)linkedin\.com$/i.test(u.hostname)) {
    const viewMatch = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/);
    const jobId = viewMatch?.[1] ?? u.searchParams.get("currentJobId");
    if (jobId && /^\d+$/.test(jobId)) return `https://www.linkedin.com/jobs/view/${jobId}/`;
  }
  return u.toString();
}

/** Is this (normalized) URL a LinkedIn job posting? Display-only signal. */
export function isLinkedInJobUrl(url: string | null): boolean {
  return !!url && url.startsWith("https://www.linkedin.com/jobs/view/");
}
