/**
 * Title relevance — keeps the corpus on-target (senior product, program, and
 * AI/ML technical roles). Pure regex, no deps, so scan.ts and one-off scripts can
 * share the exact same rule. The old filter matched bare "ai"/"ml", which pulled
 * in off-target AI-adjacent roles (data-labeling/training gigs, sales, support) at
 * AI-native companies. Now: a title is relevant if it's a PM/ops/program title OR
 * pairs an AI/ML term with a real role word — and NEVER if it hits the exclusions.
 */

/** Product / program / ops titles that are in-scope on their own. */
const CORE_TITLE =
  /\b(product manager|product lead|product owner|head of product|director of product|vp,? ?product|group product|principal product|staff product|founding product|chief product(?: officer)?|\bpm\b|data product|product strateg\w*|technical program manager|program manager|\btpm\b|biz ?ops|business operations|strategy & ops|strategy and operations|rev ?ops|revenue operations|chief of staff|head of operations|growth (?:pm|product|lead|manager))\b/i;

/** AI/ML term + a substantive role word ⇒ in-scope (AI/ML engineering & science). */
const AI_TERM = /\b(a\.?i\.?|ml|machine learning|gen ?ai|generative|\bllm\b|deep learning|nlp|computer vision|applied ai|artificial intelligence)\b/i;
const AI_ROLE = /\b(engineer|scientist|research(?:er)?|fellows?|architect|developer|product|platform|infrastructure|\blead\b|head|director|\bvp\b|principal|staff|founding|manager|strateg\w*)\b/i;

/** Off-target families to never ingest, even when an AI/ML term is present. */
export const EXCLUDE_TITLE =
  /\b(trainer|annotat\w*|labell?er|labell?ing|\brater\b|evaluator|tutor|teacher|data entry|transcrib\w*|transcription|voice[ -]?(?:actor|acting|over)|linguist|proofread\w*|account executive|account manager|\bsales\b|business development|\bbdr\b|\bsdr\b|commercial associate|customer (?:success|support|experience)|technical support|support specialist|ambassador|campus|\bintern(?:ship)?\b|recruit\w*|talent acquisition|community manager|content (?:writer|creator)|copywriter|social media|marketing|executive assistant|paralegal|bookkeep\w*|accountant)\b/i;

/** A role title is in-scope iff it hits a core/AI pattern and not the exclusions. */
export function isRelevantTitle(title: string, kwRe: RegExp | null = null): boolean {
  if (!title) return false;
  // A clear product/program/ops title is in-scope even if it names a domain like
  // sales/marketing (e.g. "Product Manager, Sales Tools" is still a PM role).
  if (CORE_TITLE.test(title)) return true;
  // Otherwise the exclusions win: off-target families (labeling/sales/support/…).
  if (EXCLUDE_TITLE.test(title)) return false;
  if (AI_TERM.test(title) && AI_ROLE.test(title)) return true;
  return kwRe ? kwRe.test(title) : false;
}
