/**
 * ATS board fetchers (demand-driven ingestion). Pulls open roles straight from
 * companies' public Applicant Tracking System APIs — Greenhouse, Ashby, Lever.
 * Official, free, structured JSON; it's how the seed 557 were sourced. We try
 * each provider against a company slug until one answers.
 *
 * No auth, no scraping ToS issues — these are the companies' own public job
 * board endpoints. Description is normalised to plain text for embedding.
 */

export type AtsProvider = "greenhouse" | "ashby" | "lever" | "yc";

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
 * Work at a Startup (YC) board fetcher — the Stage B path for YC companies that
 * don't expose a public Greenhouse/Ashby/Lever board (docs/admin-ingestion.md).
 * The public company jobs page (ycombinator.com/companies/{ycSlug}/jobs) is an
 * Inertia.js app that ships the full posting list as JSON in the page's
 * `data-page` attribute — no auth, no headless rendering, one fetch per company.
 *
 * The list view has no full JD text, so we compose a structured description from
 * the rich fields it does carry (role, type, location, experience, comp, visa,
 * skills). That's enough to embed + run the Claude extract pass; fetching each
 * job's own page for the full JD is a later enrichment, not needed to source.
 */
export async function fetchYcWaas(ycSlug: string, company: string): Promise<AtsPosting[]> {
  let html: string;
  try {
    const r = await fetch(`https://www.ycombinator.com/companies/${ycSlug}/jobs`, {
      headers: { "user-agent": "Mozilla/5.0 (RoleOS sourcing bot)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return [];
    html = await r.text();
  } catch {
    return [];
  }

  const m = html.match(/data-page="([^"]*)"/);
  if (!m) return [];
  let props: { jobPostings?: Array<Record<string, unknown>> };
  try {
    props = (JSON.parse(decodeHtmlAttr(m[1])) as { props?: typeof props }).props ?? {};
  } catch {
    return [];
  }
  const jobs = props.jobPostings ?? [];

  return jobs
    .map((job): AtsPosting | null => {
      const path = String(job.url ?? "");
      if (!path) return null;
      const url = path.startsWith("http") ? path : `https://www.ycombinator.com${path}`;
      return {
        externalId: `yc_${job.id}`,
        company,
        title: String(job.title ?? ""),
        location: (job.location as string) || null,
        url,
        description: composeWaasDescription(company, job),
        provider: "yc" as const,
      };
    })
    .filter((p): p is AtsPosting => !!p && !!p.title);
}

/** Build readable description text from a WAAS posting's structured fields. */
function composeWaasDescription(company: string, job: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const skills = Array.isArray(job.skills) ? (job.skills as unknown[]).map(String).filter(Boolean) : [];
  const lines = [
    str(job.title),
    [str(job.prettyRole) || str(job.role), str(job.type), str(job.location)].filter(Boolean).join(" · "),
    str(job.minExperience) && `Experience: ${str(job.minExperience)}`,
    [str(job.salaryRange), str(job.equityRange)].filter(Boolean).join(" · ") &&
      `Compensation: ${[str(job.salaryRange), str(job.equityRange)].filter(Boolean).join(" · ")}`,
    str(job.visa) && `Work authorization: ${str(job.visa)}`,
    skills.length ? `Skills: ${skills.join(", ")}` : "",
    str(job.companyOneLiner) && `About ${company}: ${str(job.companyOneLiner)}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Enrich a WAAS posting with its full JD text. The list view (fetchYcWaas) has no
 * description; the individual job page carries `props.job.description` (the real
 * JD) + `interview_process`. Called per-role at insert time ONLY for the roles
 * that pass the relevance filter — so the N+1 cost is bounded to roles we keep.
 * Returns null on any failure; the caller keeps the composed-fields description.
 */
export async function fetchYcJobDescription(jobUrl: string): Promise<string | null> {
  let html: string;
  try {
    const r = await fetch(jobUrl, {
      headers: { "user-agent": "Mozilla/5.0 (RoleOS sourcing bot)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    html = await r.text();
  } catch {
    return null;
  }
  const m = html.match(/data-page="([^"]*)"/);
  if (!m) return null;
  try {
    const job = (JSON.parse(decodeHtmlAttr(m[1])) as { props?: { job?: Record<string, unknown> } }).props?.job;
    const desc = htmlToText(String(job?.description ?? ""));
    if (!desc) return null;
    const interview = htmlToText(String(job?.interview_process ?? ""));
    return interview ? `${desc}\n\nInterview process:\n${interview}` : desc;
  } catch {
    return null;
  }
}

/** Decode the HTML-entity-encoded JSON in an attribute value. */
function decodeHtmlAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Fetch a company's open roles — try each public ATS against the slug, then fall
 * back to the YC Work-at-a-Startup board (when a yc_slug is known) for YC
 * companies not on a standard ATS. Returns [] if none answer.
 */
export async function fetchCompanyPostings(
  company: string,
  slug?: string,
  ycSlug?: string,
): Promise<AtsPosting[]> {
  const s = slug || companySlug(company);
  for (const fetcher of [fetchGreenhouse, fetchAshby, fetchLever]) {
    const posts = await fetcher(s, company);
    if (posts.length) return posts.filter((p) => p.url && p.title);
  }
  if (ycSlug) {
    const posts = await fetchYcWaas(ycSlug, company);
    if (posts.length) return posts.filter((p) => p.url && p.title);
  }
  return [];
}
