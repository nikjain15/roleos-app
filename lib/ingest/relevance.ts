/**
 * Title relevance — keeps the corpus on-target (senior product, program, and
 * AI/ML technical roles). Pure regex, no deps, so scan.ts and one-off scripts can
 * share the exact same rule. The old filter matched bare "ai"/"ml", which pulled
 * in off-target AI-adjacent roles (data-labeling/training gigs, sales, support) at
 * AI-native companies. Now: a title is relevant if it's a PM/ops/program title OR
 * pairs an AI/ML term with a real role word — and NEVER if it hits the exclusions.
 *
 * SCOPE (2026-08-09). The index is product / program / ops / strategy. It had
 * drifted: 41% of displayed roles were engineering, science or design, and
 * "AI / ML Engineer" (718) was nearly twice the largest PM bucket — on a page
 * describing "senior product, program, ops and strategy roles". So AI_ROLE no
 * longer accepts bare engineering role words (engineer / scientist / architect /
 * researcher); an AI term must now pair with a product, leadership, strategy or
 * governance word. Existing engineering roles were archived, not deleted.
 *
 * Same pass added the non-engineering families the filter was silently missing:
 * product ops (we matched biz ops and rev ops but not product ops), portfolio /
 * delivery / transformation directors, partnerships, developer relations, and
 * product marketing — the last of which was contradictory, since "Director of
 * Product Marketing" passed while "Product Marketing Manager, AI" did not.
 */

/**
 * Product / program / ops titles that are in-scope on their own.
 *
 * `products?` and `head of products` matter more than they look: enterprises
 * pluralise ("Head of Digital Products") where startups don't, and the singular-
 * only pattern dropped those outright. Same for "platform owner", which is what
 * several banks call a product owner.
 *
 * Channel-specific additions do NOT go here — see CHANNEL_CORE below.
 */
const CORE_TITLE =
  /\b(product manager|product lead|product owner|platform owner|head of (?:\w+ ){0,2}products?|director of (?:\w+ ){0,2}products?|vp,? ?products?|group product|principal product|staff product|founding product|chief product(?: officer)?|\bpm\b|data product|product strateg\w*|technical program manager|program manager|\btpm\b|product designer|product design|product ops|product operations|portfolio director|delivery director|transformation director|partnerships|developer relations|dev ?rel|developer experience|developer advocacy|product marketing|biz ?ops|business operations|strategy & ops|strategy and operations|rev ?ops|revenue operations|chief of staff|head of operations|growth (?:pm|product|lead|manager))\b/i;

/**
 * AI/ML term + a substantive role word ⇒ in-scope (AI/ML engineering & science).
 *
 * "data"/"analytics" are deliberately in AI_TERM. Measured on the finance boards:
 * banks and asset managers title this work "Data Scientist" or "Data Engineer"
 * where AI-native companies write "ML Engineer", so requiring an explicit AI/ML
 * word silently dropped the exact roles we source those firms for. The role word
 * is still required, so "data entry" and "analytics ambassador" stay out — and
 * the exclusions run first regardless.
 */
const AI_TERM = /\b(a\.?i\.?|ml|machine learning|gen ?ai|generative|\bllm\b|deep learning|nlp|computer vision|applied ai|artificial intelligence|data|analytics|quantitative|\bquant\b)\b/i;
const AI_ROLE = /\b(product|platform|\blead\b|head|director|\bvp\b|principal|founding|manager|strateg\w*|governance|policy|risk|ethics|enablement)\b/i;

/**
 * Hard exclusions: the role itself is off-target, so no core title can rescue it
 * (2026-08-10). These describe what the job IS — a junior/temporary programme
 * (intern, campus, ambassador), or a labeling/teaching/clerical job — not a
 * domain a PM could own. Checked BEFORE the CORE_TITLE early return, because
 * "Product Manager Intern" and "Campus Product Manager" both contain a core
 * phrase and were sailing straight into a corpus scoped to senior roles.
 */
const HARD_EXCLUDE_TITLE =
  /\b(trainer|annotat\w*|labell?er|labell?ing|\brater\b|evaluator|tutor|teacher|data entry|transcrib\w*|transcription|voice[ -]?(?:actor|acting|over)|linguist|proofread\w*|ambassador|campus|\bintern(?:ship)?\b|executive assistant|paralegal|bookkeep\w*|accountant)\b/i;

/**
 * Domain exclusions: off-target on their own, but overridable by a core title,
 * since these name a business function a product role can legitimately serve —
 * "Product Manager, Sales Tools" is a PM role, not a sales role. Checked AFTER
 * CORE_TITLE, which is what makes them overridable.
 */
const DOMAIN_EXCLUDE_TITLE =
  /\b(data cent(?:er|re)|account executive|account manager|\bsales\b|business development|\bbdr\b|\bsdr\b|commercial associate|customer (?:success|support|experience)|technical support|support specialist|recruit\w*|talent acquisition|community manager|content (?:writer|creator)|copywriter|social media|marketing)\b/i;

/** Off-target families to never ingest, even when an AI/ML term is present. */
export const EXCLUDE_TITLE = new RegExp(
  `(?:${HARD_EXCLUDE_TITLE.source})|(?:${DOMAIN_EXCLUDE_TITLE.source})`,
  "i",
);

/**
 * ── Per-channel tuning (2026-08-10) ─────────────────────────────────────────
 *
 * Sourcing channels disagree about what a title looks like, and they drift at
 * different rates. An ATS board prints the company's own internal title once and
 * leaves it alone; LinkedIn prints whatever a recruiter typed, reworded for the
 * feed, and the mix changes as the feed re-ranks. So LinkedIn's rules are
 * expected to keep moving while the board rules stay put — and a change made for
 * LinkedIn must not silently re-scope the whole ATS corpus.
 *
 * Hence: `CORE_TITLE` / the exclusions are the shared baseline every channel
 * gets, and each channel may add its own patterns on top. Adding a channel means
 * adding a key here, not editing the baseline.
 */
export type SourceChannel = "ats" | "linkedin";

/**
 * Extra in-scope titles, per channel. Checked at exactly the same point as
 * CORE_TITLE — after the hard exclusions, before the engineering cut — so a
 * channel title beats ENGINEERING_TITLE the same way a core title does.
 *
 * linkedin: `product management` names the discipline rather than the person,
 * which is how consultancies and enterprises write it on LinkedIn ("Senior
 * Manager, AI & Developer Platform Product Management"). The manager-only
 * baseline dropped every one, and worse, dropped them silently — such titles
 * fell through to ENGINEERING_TITLE and were rejected on the word "Developer".
 * Kept channel-local because it's a LinkedIn phrasing habit, not a board one.
 */
const CHANNEL_CORE: Partial<Record<SourceChannel, RegExp>> = {
  linkedin: /\b(product management|head of product|ai product|product & (?:technology|engineering))\b/i,
};

/**
 * Extra out-of-scope titles, per channel. Checked with the hard exclusions, so
 * nothing rescues them. Empty for now: this exists because LinkedIn's feed mixes
 * promoted and recruiter-managed posts that the boards never carry, and that is
 * where noise will show up first once real queries run.
 */
const CHANNEL_EXCLUDE: Partial<Record<SourceChannel, RegExp>> = {};

/**
 * Hands-on engineering / science titles. Out of scope since 2026-08-09 — the
 * index is product, program, ops and strategy. Checked AFTER core titles so
 * "Head of Product" style leadership still wins, and after the FDE carve-out
 * below, because forward-deployed and solutions engineering are a deliberate
 * adjacent path (docs/FDE_JOURNEY.md), not the engineering we're cutting.
 */
const ENGINEERING_TITLE = /\b(engineer|engineering|scientist|architect|researcher|developer)\b/i;
/** The one engineering family we keep. */
const FDE_TITLE = /\b(forward[- ]?deployed|solutions? (?:engineer|architect)|field engineer)\b/i;

/**
 * A role title is in-scope iff it hits a core/AI pattern and not the exclusions.
 *
 * `channel` selects the per-channel overlay (CHANNEL_CORE / CHANNEL_EXCLUDE) on
 * top of the shared baseline. It defaults to "ats" so every existing caller and
 * one-off script keeps the exact behaviour it had.
 */
export function isRelevantTitle(
  title: string,
  kwRe: RegExp | null = null,
  channel: SourceChannel = "ats",
): boolean {
  if (!title) return false;
  // Hard exclusions first: an intern/campus/labeling role is off-target however
  // senior the words around it sound ("Product Manager Intern" is still an intern).
  if (HARD_EXCLUDE_TITLE.test(title)) return false;
  if (CHANNEL_EXCLUDE[channel]?.test(title)) return false;
  // A clear product/program/ops title is in-scope even if it names a domain like
  // sales/marketing (e.g. "Product Manager, Sales Tools" is still a PM role).
  if (CORE_TITLE.test(title)) return true;
  // Same standing as a core title, but only for the channel that declared it.
  if (CHANNEL_CORE[channel]?.test(title)) return true;
  // Forward-deployed / solutions engineering: the one engineering family we keep
  // (docs/FDE_JOURNEY.md). In-scope on its own, like a core title.
  if (FDE_TITLE.test(title)) return true;
  // Otherwise the domain exclusions win: sales/support/recruiting/marketing and
  // friends, in-scope only when a core title above already claimed the title.
  if (DOMAIN_EXCLUDE_TITLE.test(title)) return false;
  // Hands-on engineering/science is out of scope (FDE already returned above).
  if (ENGINEERING_TITLE.test(title)) return false;
  if (AI_TERM.test(title) && AI_ROLE.test(title)) return true;
  return kwRe ? kwRe.test(title) : false;
}
