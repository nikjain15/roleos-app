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

/** Off-target families to never ingest, even when an AI/ML term is present. */
export const EXCLUDE_TITLE =
  /\b(trainer|annotat\w*|labell?er|labell?ing|\brater\b|evaluator|tutor|teacher|data entry|data cent(?:er|re)|transcrib\w*|transcription|voice[ -]?(?:actor|acting|over)|linguist|proofread\w*|account executive|account manager|\bsales\b|business development|\bbdr\b|\bsdr\b|commercial associate|customer (?:success|support|experience)|technical support|support specialist|ambassador|campus|\bintern(?:ship)?\b|recruit\w*|talent acquisition|community manager|content (?:writer|creator)|copywriter|social media|marketing|executive assistant|paralegal|bookkeep\w*|accountant)\b/i;

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

/** A role title is in-scope iff it hits a core/AI pattern and not the exclusions. */
export function isRelevantTitle(title: string, kwRe: RegExp | null = null): boolean {
  if (!title) return false;
  // A clear product/program/ops title is in-scope even if it names a domain like
  // sales/marketing (e.g. "Product Manager, Sales Tools" is still a PM role).
  if (CORE_TITLE.test(title)) return true;
  // Forward-deployed / solutions engineering: the one engineering family we keep
  // (docs/FDE_JOURNEY.md). In-scope on its own, like a core title.
  if (FDE_TITLE.test(title)) return true;
  // Otherwise the exclusions win: off-target families (labeling/sales/support/…).
  if (EXCLUDE_TITLE.test(title)) return false;
  // Hands-on engineering/science is out of scope (FDE already returned above).
  if (ENGINEERING_TITLE.test(title)) return false;
  if (AI_TERM.test(title) && AI_ROLE.test(title)) return true;
  return kwRe ? kwRe.test(title) : false;
}
