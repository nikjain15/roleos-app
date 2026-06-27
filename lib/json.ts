/**
 * Tolerant JSON parse for model output. LLMs occasionally emit a stray unquoted
 * key, a trailing comma, or wrap JSON in ``` fences or prose. We try strict
 * first, then a light repair, then a brace-slice — so a single glitch token
 * doesn't drop an otherwise-good structured result. Returns null if truly
 * unparseable (callers fail closed / surface needs-your-eyes).
 */
export function parseModelJson<T = unknown>(text: string): T | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const candidates = [stripped, sliceBraces(stripped)].filter(Boolean) as string[];
  for (const c of candidates) {
    const direct = tryParse<T>(c);
    if (direct !== null) return direct;
    const repaired = tryParse<T>(repair(c));
    if (repaired !== null) return repaired;
  }
  return null;
}

function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** Quote unquoted object keys; drop trailing commas. Conservative. */
function repair(s: string): string {
  return s
    // quote bare keys after { or , (won't touch already-quoted keys — those
    // follow a " not an identifier char)
    .replace(/([{,]\s*)([A-Za-z_][\w]*)(\s*:)/g, '$1"$2"$3')
    // remove trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, "$1");
}

/** Take the outermost {...} or [...] span (tolerates leading/trailing prose). */
function sliceBraces(s: string): string | null {
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstObj, firstArr);
  if (start === -1) return null;
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  const end = s.lastIndexOf(close);
  if (end <= start) return null;
  return s.slice(start, end + 1);
}
