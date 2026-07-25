/**
 * Ticker-copy honesty guard (onboarding S2, PRD §4). Every line RO shows while
 * "working" must pass the non-tech-friend test — no implementation jargon, no
 * fake steps. This blocklist is asserted in tests and can gate runtime copy.
 */

// Words that leak the machinery. If any appears in a user-facing status line,
// rewrite it in plain English ("comparing you against every open role", not
// "running embeddings + rerank").
export const JARGON_BLOCKLIST = [
  "embedding",
  "embeddings",
  "rerank",
  "reranking",
  "re-rank", // note: the *feature* is "re-rank" in UI, but never in a ticker line
  "vector",
  "pgvector",
  "cosine",
  "similarity score",
  "token",
  "tokens",
  "llm",
  "prompt",
  "inference",
  "model call",
  "api",
  "endpoint",
  "pipeline",
  "distill",
  "normalize",
  "corpus",
  "index" as string, // "my index" is allowed in RO's voice elsewhere; not in a ticker step
].map((w) => w.toLowerCase());

/**
 * True when `line` is free of implementation jargon. Word-boundary matched so
 * "reindexed" doesn't trip "index" and "distillery" doesn't trip "distill"
 * only where it's a standalone term.
 */
export function isPlainEnglish(line: string): boolean {
  return offendingTerms(line).length === 0;
}

/** The blocklisted terms found in `line` (lowercased), for test diagnostics. */
export function offendingTerms(line: string): string[] {
  const lower = line.toLowerCase();
  return JARGON_BLOCKLIST.filter((term) => {
    // whole-word / phrase match — avoids substring false positives
    const re = new RegExp(`(^|[^a-z])${escapeRegex(term)}([^a-z]|$)`, "i");
    return re.test(lower);
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
