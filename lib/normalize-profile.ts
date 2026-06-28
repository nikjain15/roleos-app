/**
 * Strip extraction noise from a CV / LinkedIn-PDF dump. Pure + dependency-free,
 * so it runs anywhere — the browser (after PDF extract) AND the server (on any
 * onboarding input, paste included).
 *
 * The token cost is the WORDS, not the format — so the win isn't "convert to
 * HTML/MD" (HTML is MORE tokens, MD ~neutral), it's removing the boilerplate a
 * PDF export carries: page numbers, running headers/footers (the name repeated
 * every page), dividers, standalone URLs, empty section chrome, blank-line
 * sprawl. On a LinkedIn export that's often 20–40% of the bytes — fewer tokens
 * AND a cleaner signal. Conservative: only clearly-boilerplate lines are dropped.
 */
const NOISE_LINE = [
  /^page\s+\d+(\s+of\s+\d+)?$/i,
  /^\d+\s*\/\s*\d+$/, // 1/4
  /^[-_=•·*–—\s]{2,}$/, // divider rules
  /^(contact|top skills|languages|certifications|honors[- ]awards)\s*$/i, // empty LinkedIn section chrome
];
const URL_ONLY = /^(https?:\/\/|www\.)\S+$/i;

export function normalizeProfileText(raw: string): string {
  let lines = raw
    .replace(/\r/g, "")
    .replace(/ /g, " ") // nbsp
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim());

  // Frequency map catches running headers/footers (repeat once per page).
  const freq = new Map<string, number>();
  for (const l of lines) if (l) freq.set(l, (freq.get(l) ?? 0) + 1);

  lines = lines.filter((l) => {
    if (NOISE_LINE.some((re) => re.test(l))) return false;
    if (URL_ONLY.test(l)) return false;
    if (l && l.length < 50 && (freq.get(l) ?? 0) >= 3) return false; // running header/footer
    return true;
  });

  // collapse runs of blank lines to a single separator
  const out: string[] = [];
  let blank = 0;
  for (const l of lines) {
    if (l === "") {
      if (++blank > 1) continue;
    } else blank = 0;
    out.push(l);
  }
  return out.join("\n").trim();
}
