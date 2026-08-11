/**
 * Presence phase 1: deterministic filtering and ranking. No model calls.
 *
 * Direct port of nik-jain-jobos/social/signals/lib/rank.mjs (the proven local
 * pipeline) so the RoleOS collector ranks identically to the console it
 * replaces. Everything here was a judgement call in a markdown file before it
 * was a predicate. The reaction window in particular came from measuring, on
 * 2026-08-09, that a comment on a 1,676-reaction post sits at position 80 and
 * is not read.
 *
 * The honest ceiling, kept on purpose: keyword matching cannot tell a post
 * about agents from a post worth commenting on (a crypto product launch ranked
 * first on one live run). Tuning stopped there deliberately; phase 2 is
 * semantic scoring on the Workers AI binding, not more regexes.
 */

export interface PresenceItem {
  platform: string;
  source_id: string | null;
  url: string | null;
  author: string | null;
  author_headline: string | null;
  title: string | null;
  body: string | null;
  posted_at: string | null;
  engagement: number | null;
  raw?: unknown;
}

export interface RankedItem extends PresenceItem {
  score: number;
  hits: string[];
  age_hours: number | null;
}

export interface RankConfig {
  max_age_hours: number;
  max_engagement: number;
  min_score: number;
  top_n: number;
  dead_after_hours: number;
}

/** scoring row in presence_settings merges over these, as scoring.json did locally. */
export const DEFAULT_RANK_CONFIG: RankConfig = {
  max_age_hours: 72,
  max_engagement: 500,
  min_score: 5,
  top_n: 15,
  dead_after_hours: 12,
};

/** Tier C from social/voices-by-keyword.md: association runs both ways. */
export const EXCLUDE_PATTERNS: RegExp[] = [
  /\bcertification\b/i, /\bbootcamp\b/i, /\bcohort\b/i, /\benroll\b/i,
  /\bdiscount\b/i, /\bcoupon\b/i, /\b\d{1,3}% off\b/i, /\bsale is live\b/i,
  /\bwhat (are|is) (llm )?evals\?/i, /\bbeginner'?s guide\b/i,
  /\bbuild challenge\b/i, /\bsubmission for\b/i,
  /\bgiveaway\b/i, /\bfree webinar\b/i, /\bmasterclass\b/i,
  /\bprop firm\b/i, /\bfunded account\b/i, /\bpayout\b/i, /\btrader funding\b/i,
];

/**
 * Job postings are the dominant false positive, found on the first live run
 * 2026-08-11. A recruiter's JD contains every term the scorer cares about, so
 * it outscores any real practitioner post. Two or more of these together is a
 * job posting; one alone is not enough (a real post may legitimately say
 * "years of experience").
 */
export const JOB_POSTING_MARKERS: RegExp[] = [
  /\bw2\b|\bc2c\b|\b1099\b/i,
  /\$\s?\d{2,3}\s?\/\s?(hr|hour)\b/i,
  /\brate\s*:?\s*\$/i,
  /\bmust reside\b|\bauthorized to work\b|\bwork authorization\b/i,
  /\bonsite presence\b|\bdays per week\b|\bhybrid\b.{0,20}\bonsite\b/i,
  /\binterview mode\b|\bservice term\b|\bcontract duration\b/i,
  /\bqualifications?\s*(&|and)\s*skills\b|\bjob description\b/i,
  /\bshare (your |the )?(cv|resume|profile)\b|\bDM (me )?(your )?(cv|resume)\b/i,
  /\bwe'?re hiring\b|\bnow hiring\b|\bapply now\b|\bjob alert\b|\bimmediate joiners?\b/i,
  /\b\d{1,2}\+?\s*(years|yrs)\b.{0,30}\bexperience\b/i,
  /\blocation\s*:\s*\w/i,
  // Softer recruiting language, added after a Bristol Myers Squibb hiring post
  // reached position 3 on the second live run with only one marker matching.
  /\bopen roles?\b|\bwe'?re scaling the\b|\bteam at\b.{0,40}\bhiring\b/i,
  /\bjoin (us|my team|our team)\b|\broles? on my team\b|\bthis is that job\b/i,
  /\breferrals? welcome\b|\btagging (a )?friend\b|\bknow someone\b/i,
  // Job-seeker posts, the mirror image of a recruiter post. Same keyword
  // density, same zero value as a comment target.
  /\bopen to work\b|\bexploring new opportunities\b|\bactively (looking|seeking)\b/i,
  /\bmy expertise includes\b|\bavailable (for|immediately)\b|\bseeking (a )?(new )?role\b/i,
];

/**
 * Vendor and product marketing. Distinct from job postings: a launch thread
 * hits every keyword and invites no conversation worth joining. Found on the
 * second live run, where a crypto-agent product launch ranked first.
 */
export const PROMO_MARKERS: RegExp[] = [
  /\bintroducing\b|\bannouncing\b|\bnow (generally )?available\b|\blaunch(ing|ed)?\b/i,
  /\bsign ?up\b|\bwaitlist\b|\bbook a demo\b|\bget started (today|free)\b|\btry it (free|now)\b/i,
  /\bour (platform|product|stack|suite)\b|\bwe built\b.{0,30}\bso you\b/i,
  /\bpowered by\b.{0,25}\b(stack|platform)\b/i,
];

export function jobPostingScore(text: string): number {
  return JOB_POSTING_MARKERS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

/**
 * Content fingerprint. The same post cross-published to three LinkedIn groups
 * arrives as three URLs, so URL dedup alone let a recruiter occupy the top
 * three slots on the first live run.
 */
export function contentHash(item: PresenceItem): string {
  const s = textOf(item).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${item.platform}:${h}`;
}

/** Terms that make a post on-beat. Weighted: the rarer in job postings, the more it distinguishes the positioning. */
export const SIGNAL_TERMS: { re: RegExp; weight: number; label: string }[] = [
  { re: /\bhuman[- ]in[- ]the[- ]loop\b|\bHITL\b/i, weight: 5, label: "hitl" },
  { re: /\bapprov(al|er|es|ed)\b|\breview queue\b|\bsign[- ]?off\b/i, weight: 4, label: "approval" },
  { re: /\bparity\b|\bshadow (mode|run)\b|\bparallel run\b|\bregression\b/i, weight: 5, label: "parity" },
  { re: /\bevals?\b|\bevaluation\b|\bLLM[- ]as[- ]a?[- ]?judge\b/i, weight: 3, label: "evals" },
  { re: /\bguardrail/i, weight: 3, label: "guardrails" },
  { re: /\bprecision\b|\brecall\b|\bfalse positive/i, weight: 3, label: "precision-recall" },
  { re: /\bcomplian\w+|\bregulat\w+|\baudit\w*/i, weight: 4, label: "regulated" },
  { re: /\bagentic\b|\bAI agents?\b/i, weight: 2, label: "agents" },
  { re: /\bprompt injection\b|\bjailbreak/i, weight: 3, label: "injection" },
  { re: /\bdeterministic\b|\brules engine\b/i, weight: 3, label: "deterministic" },
  { re: /\bmodel selection\b|\binference cost\b|\btoken cost\b/i, weight: 3, label: "cost" },
];

const HOURS = (ms: number) => ms / 36e5;

export function textOf(item: PresenceItem): string {
  return [item.title, item.body].filter(Boolean).join("\n");
}

/**
 * Age in hours, with the future-dated case handled.
 *
 * The first live run returned ages of -5h and -6h, which is a timezone
 * artifact: the API emits a local timestamp with no offset and Date parses it
 * as UTC. A small negative age means "just posted", so clamp it to 0. A large
 * negative one is a genuinely bad date, so report unknown rather than invent
 * freshness.
 */
export function ageHours(item: PresenceItem, now: number = Date.now()): number | null {
  if (!item.posted_at) return null;
  const t = new Date(item.posted_at).getTime();
  if (isNaN(t)) return null;
  const h = HOURS(now - t);
  if (h < 0) return h > -14 ? 0 : null;
  return h;
}

/**
 * Reject reasons are returned rather than thrown so the run report can show
 * what was dropped and why. Silent truncation reads as "covered everything".
 */
export function rejectReason(item: PresenceItem, cfg: RankConfig, now: number = Date.now()): string | null {
  const text = textOf(item);
  if (!text.trim()) return "empty";
  if (!item.url) return "no-url";

  const age = ageHours(item, now);
  if (age !== null && age > cfg.max_age_hours) return `stale:${Math.round(age)}h`;

  for (const re of EXCLUDE_PATTERNS) if (re.test(text)) return `excluded:${re.source.slice(0, 24)}`;

  // Two markers together is a job posting. One alone is not: a real post may
  // legitimately mention years of experience.
  const jp = jobPostingScore(text);
  if (jp >= 2) return `job-posting:${jp}`;

  const promo = PROMO_MARKERS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  if (promo >= 2) return `promo:${promo}`;

  // Hits many topics, nobody engaged. That combination is an SEO listicle, and
  // neither signal alone is conclusive enough to reject on.
  const stuffed = SIGNAL_TERMS.filter((t) => t.re.test(text)).length >= 6;
  if (stuffed && item.engagement === 0) return "stuffed-and-dead";

  // Unknown engagement is not a rejection. Only a known-too-large number is.
  if (typeof item.engagement === "number" && item.engagement > cfg.max_engagement) {
    return `too-big:${item.engagement}`;
  }

  // A post nobody has reacted to after a day is not a conversation to join.
  // Zero is only meaningful once the post has had time to collect reactions,
  // so this never fires on something posted in the last few hours.
  if (item.engagement === 0 && age !== null && age >= cfg.dead_after_hours) {
    return "no-engagement";
  }
  return null;
}

export function scoreItem(item: PresenceItem): { score: number; hits: string[] } {
  const text = textOf(item);
  const hits: string[] = [];
  let score = 0;
  for (const t of SIGNAL_TERMS) {
    if (t.re.test(text)) { score += t.weight; hits.push(t.label); }
  }

  // Two signal terms together is worth more than either alone: the whole
  // positioning is the intersection, not any single keyword.
  if (hits.length >= 2) score += 3;
  if (hits.length >= 4) score += 3;

  // A post asking a question is a better comment target than one making a
  // pronouncement: answering beats agreeing, and agreeing is banned anyway.
  if (/\?\s*$/m.test(text)) { score += 2; hits.push("asks-question"); }

  // Real numbers signal a practitioner rather than a commentator.
  if (/\b\d+(\.\d+)?%|\b0\.\d{2}\b/.test(text)) { score += 2; hits.push("has-numbers"); }

  // Sweet-spot engagement: visible enough to matter, small enough to be read.
  // This is the difference between a live thread and a post nobody saw, so it
  // outweighs any single keyword.
  if (typeof item.engagement === "number") {
    if (item.engagement >= 20 && item.engagement <= 300) { score += 8; hits.push("reachable"); }
    else if (item.engagement >= 5) { score += 3; hits.push("some-traction"); }
    else if (item.engagement === 0) { score -= 4; hits.push("no-traction"); }
  }

  // Keyword stuffing is a spam signal, not a relevance signal. A post hitting
  // seven distinct topics is a spec sheet or an SEO listicle, not an argument.
  if (hits.filter((h) => h !== "asks-question" && h !== "has-numbers").length >= 6) {
    score -= 6; hits.push("keyword-stuffed");
  }

  // One unexcluded job-posting marker still warrants suspicion.
  if (jobPostingScore(text) === 1) score -= 3;

  return { score, hits };
}

export interface RankResult {
  kept: RankedItem[];
  dropped: { item: PresenceItem; reason: string }[];
}

export function rank(items: PresenceItem[], cfg: RankConfig, now: number = Date.now()): RankResult {
  const kept: RankedItem[] = [];
  const dropped: { item: PresenceItem; reason: string }[] = [];
  const seenContent = new Set<string>();

  for (const it of items) {
    const reason = rejectReason(it, cfg, now);
    if (reason) { dropped.push({ item: it, reason }); continue; }

    // Content dedup, separate from URL dedup: the same post cross-published to
    // several groups arrives under several URLs.
    const h = contentHash(it);
    if (seenContent.has(h)) { dropped.push({ item: it, reason: "duplicate-content" }); continue; }
    seenContent.add(h);

    const { score, hits } = scoreItem(it);
    if (score < cfg.min_score) { dropped.push({ item: it, reason: `low-score:${score}` }); continue; }
    kept.push({ ...it, score, hits, age_hours: ageHours(it, now) });
  }
  kept.sort((a, b) => b.score - a.score || (a.age_hours ?? 1e9) - (b.age_hours ?? 1e9));
  return { kept, dropped };
}
