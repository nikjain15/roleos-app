/**
 * Format the raw master-profile blob into clean, readable blocks for the "Your CV"
 * reference (résumé-editor v2). The profile is stored as a markdown-ish text blob;
 * this turns it into headings / bullets / paragraphs so the reference reads like a
 * standard CV instead of raw `**asterisks**`. PURE + tolerant; unit-tested.
 */

export type CvBlock =
  | { type: "head"; text: string }
  | { type: "bullet"; text: string }
  | { type: "text"; text: string };

/** Drop inline emphasis/heading markers so text renders plainly. */
const clean = (s: string): string =>
  s
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^#+\s*/, "")
    .trim();

export function formatCv(raw: string): CvBlock[] {
  const blocks: CvBlock[] = [];
  for (const rawLine of (raw ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^-{3,}$/.test(line)) continue; // a `---` divider → just whitespace

    // A whole-line-bold or markdown-heading line is a section header.
    if (/^\*\*.+\*\*$/.test(line) || /^#+\s+/.test(line)) {
      blocks.push({ type: "head", text: clean(line) });
      continue;
    }
    // Bullets: -, •, or * markers.
    if (/^[-•*]\s+/.test(line)) {
      blocks.push({ type: "bullet", text: clean(line.replace(/^[-•*]\s+/, "")) });
      continue;
    }
    const text = clean(line);
    if (text) blocks.push({ type: "text", text });
  }
  return blocks;
}
