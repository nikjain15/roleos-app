/**
 * Archetype normalization. The extract skill emits a free-form "short role label",
 * which produced ~450 distinct values across the ingested corpus (AI/ML eng, design,
 * solutions, plus the seed's clean PM/ops set). This collapses any label into a
 * canonical taxonomy so the index ("By role type") and matching stay legible.
 *
 * Ordered, deterministic keyword rules — most specific first. Seed roles already
 * carry canonical labels and pass through unchanged.
 */
export const CANONICAL_ARCHETYPES = [
  "AI Product Manager",
  "Technical PM",
  "Generalist PM",
  "Growth PM",
  "Technical Program Manager",
  "Program Manager",
  "BizOps / Strategy & Ops",
  "Chief of Staff",
  "Growth (non-PM)",
  "AI / ML Engineer",
  "Data / ML Scientist",
  "Solutions / Forward-Deployed Engineer",
  "Product Designer",
  "Engineering Leadership",
  "AI Data & Training",
  "Sales / Account Management",
  "Other",
] as const;

const SEED_CANONICAL = new Set<string>([
  "AI Product Manager", "Technical PM", "Generalist PM", "Growth PM",
  "Technical Program Manager", "Program Manager", "BizOps / Strategy & Ops",
  "Chief of Staff", "Growth (non-PM)", "Other",
]);

const has = (s: string, ...needles: string[]) => needles.some((n) => s.includes(n));

export function normalizeArchetype(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "Other";
  if (SEED_CANONICAL.has(raw.trim())) return raw.trim(); // seed labels untouched
  const s = raw.toLowerCase();

  const isAi = has(s, "ai", "a.i", "ml", "machine learning", "genai", "gen ai", "llm", "applied ai", "artificial intelligence");
  const isPM = has(s, "product manager", "product management", "product owner", "product lead", "head of product", "director of product", "vp product", "group product", "principal product", "founding product", " pm", "(pm)");

  // role families that aren't PM, checked before the generic PM bucket
  if (has(s, "chief of staff")) return "Chief of Staff";
  if (has(s, "ai trainer", "data trainer", "annotator", "annotation", "data labeler", "labeling", "evaluator", "linguist", "voice acting", "transcription", "data entry", "rater", "ai tutor", "data specialist"))
    return "AI Data & Training";
  if (has(s, "account executive", "account manager", "sales", "commercial associate", "business development", "sdr", "bdr", "revenue", "go-to-market", "gtm"))
    return "Sales / Account Management";
  if (has(s, "product design", "ux design", "designer", "design lead", "head of design")) return "Product Designer";
  if (has(s, "forward deployed", "forward-deployed", "solutions architect", "solutions engineer", "deployment engineer", "field engineer", "implementation engineer"))
    return "Solutions / Forward-Deployed Engineer";
  if (has(s, "research scientist", "research engineer", "ml scientist", "ai scientist", "data scientist", "data science", "research fellow", "applied scientist", "research lead", "ml research"))
    return "Data / ML Scientist";
  if (has(s, "technical program manager", "tpm", "technical pgm")) return "Technical Program Manager";
  if (has(s, "engineering manager", "eng manager", "director of engineering", "head of engineering", "vp engineering", "vp of engineering", "engineering lead", "head of ai", "director, ai", "director of ai"))
    return "Engineering Leadership";

  // PM family — sub-classify
  if (isPM) {
    if (isAi) return "AI Product Manager";
    if (has(s, "growth")) return "Growth PM";
    if (has(s, "technical", "platform", "infrastructure", "infra", "api", "data product", "developer", "devtools", "ml ", "ai ")) return "Technical PM";
    return "Generalist PM";
  }

  if (has(s, "program manager", "program management", "pgm")) return "Program Manager";
  if (has(s, "growth")) return "Growth (non-PM)";
  if (has(s, "bizops", "business operations", "strategy and operations", "strategy & ops", "strategy ops", "revops", "revenue operations", "chief of staff", "operations manager", "business strategy", "gtm strategy"))
    return "BizOps / Strategy & Ops";

  // engineering — the bulk of the AI-native long tail
  if (has(s, "engineer", "developer", "swe", "programmer")) return "AI / ML Engineer";
  if (has(s, "strategy", "operations", "ops ", "analyst")) return "BizOps / Strategy & Ops";

  return "Other";
}
