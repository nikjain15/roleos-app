/**
 * ATS board fetchers (demand-driven ingestion). Pulls open roles straight from
 * companies' public Applicant Tracking System APIs — Greenhouse, Ashby, Lever.
 * Official, free, structured JSON; it's how the seed 557 were sourced. We try
 * each provider against a company slug until one answers.
 *
 * No auth, no scraping ToS issues — these are the companies' own public job
 * board endpoints. Description is normalised to plain text for embedding.
 */

export type AtsProvider = "greenhouse" | "ashby" | "lever";

export interface AtsPosting {
  externalId: string;
  company: string;
  title: string;
  location: string | null;
  url: string;
  description: string;
  provider: AtsProvider;
}

/** HTML → plain text: strip tags, decode the few entities ATS feeds use. */
function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A company name → a best-guess ATS slug (lowercase, alphanumeric). */
export function companySlug(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const j = async (url: string): Promise<unknown | null> => {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

export async function fetchGreenhouse(slug: string, company: string): Promise<AtsPosting[]> {
  const d = (await j(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`)) as
    | { jobs?: Array<Record<string, unknown>> }
    | null;
  if (!d?.jobs?.length) return [];
  return d.jobs.map((job) => ({
    externalId: `gh_${job.id}`,
    company,
    title: String(job.title ?? ""),
    location: (job.location as { name?: string } | null)?.name ?? null,
    url: String(job.absolute_url ?? ""),
    description: htmlToText(String(job.content ?? "")),
    provider: "greenhouse" as const,
  }));
}

export async function fetchAshby(slug: string, company: string): Promise<AtsPosting[]> {
  const d = (await j(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)) as
    | { jobs?: Array<Record<string, unknown>> }
    | null;
  if (!d?.jobs?.length) return [];
  return d.jobs.map((job) => ({
    externalId: `ashby_${job.id}`,
    company,
    title: String(job.title ?? ""),
    location: (job.location as string) ?? (job.isRemote ? "Remote" : null),
    url: String(job.jobUrl ?? job.applyUrl ?? ""),
    description: String(job.descriptionPlain ?? htmlToText(String(job.descriptionHtml ?? ""))),
    provider: "ashby" as const,
  }));
}

export async function fetchLever(slug: string, company: string): Promise<AtsPosting[]> {
  const d = (await j(`https://api.lever.co/v0/postings/${slug}?mode=json`)) as
    | Array<Record<string, unknown>>
    | null;
  if (!Array.isArray(d) || d.length === 0) return [];
  return d.map((p) => ({
    externalId: `lever_${p.id}`,
    company,
    title: String(p.text ?? ""),
    location: (p.categories as { location?: string } | null)?.location ?? null,
    url: String(p.hostedUrl ?? p.applyUrl ?? ""),
    description: String(p.descriptionPlain ?? htmlToText(String(p.description ?? ""))),
    provider: "lever" as const,
  }));
}

/**
 * Fetch a company's open roles — try each provider against the slug until one
 * answers. Returns [] if the company isn't on a public ATS we support.
 */
export async function fetchCompanyPostings(company: string, slug?: string): Promise<AtsPosting[]> {
  const s = slug || companySlug(company);
  for (const fetcher of [fetchGreenhouse, fetchAshby, fetchLever]) {
    const posts = await fetcher(s, company);
    if (posts.length) return posts.filter((p) => p.url && p.title);
  }
  return [];
}
