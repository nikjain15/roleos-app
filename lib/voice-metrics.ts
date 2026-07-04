/**
 * Voice mock delivery metrics (slice X8, option A). Pure, client-safe, and
 * grounded ONLY in the transcript the candidate can see — no audio analysis,
 * no model calls, nothing leaves the browser. Tone per ro-voice: observations
 * a good coach would make, never shaming.
 */

export interface CandidateTurn {
  text: string;
  /** Speaking duration in ms when voice mode captured it (optional). */
  durationMs?: number;
}

/** Hesitation fillers worth noticing (word-boundary matched, case-insensitive). */
const FILLERS = /\b(um+|uh+|erm+|like|you know|sort of|kind of|basically|actually|literally)\b/gi;

export function fillerCount(text: string): number {
  return (text.match(FILLERS) ?? []).length;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Words per minute — null unless we actually timed the answer. */
export function wordsPerMinute(words: number, durationMs: number | undefined): number | null {
  if (!durationMs || durationMs < 3_000 || words === 0) return null;
  return Math.round(words / (durationMs / 60_000));
}

/** An answer that has stopped answering: past ~250 words it's a monologue. */
export const RAMBLE_WORDS = 250;
/** An answer that never started: under ~25 words rarely lands a story. */
export const THIN_WORDS = 25;

/**
 * Honest delivery notes from candidate turns. Empty transcript → []. Every
 * note names the evidence (counts), and the copy stays gains-oriented — what
 * to try next, not what was wrong with you.
 */
export function deliveryNotes(turns: CandidateTurn[]): string[] {
  const answered = turns.filter((t) => wordCount(t.text) > 0);
  if (answered.length === 0) return [];

  const notes: string[] = [];
  const totalWords = answered.reduce((s, t) => s + wordCount(t.text), 0);
  const totalFillers = answered.reduce((s, t) => s + fillerCount(t.text), 0);
  const avgWords = Math.round(totalWords / answered.length);

  const perAnswer = totalFillers / answered.length;
  if (perAnswer >= 3) {
    notes.push(
      `Fillers: ~${Math.round(perAnswer)} per answer (${totalFillers} across ${answered.length}). A one-beat pause instead of "um" reads as composure.`,
    );
  }

  const rambles = answered.filter((t) => wordCount(t.text) > RAMBLE_WORDS).length;
  if (rambles > 0) {
    notes.push(
      `${rambles} answer${rambles === 1 ? "" : "s"} ran past ${RAMBLE_WORDS} words — land the point, then stop. Headline → evidence → result is enough.`,
    );
  }

  const thin = answered.filter((t) => wordCount(t.text) < THIN_WORDS).length;
  if (thin > 0 && thin >= answered.length / 2) {
    notes.push(
      `${thin} of ${answered.length} answers were under ${THIN_WORDS} words — you have the stories; give them one concrete example each.`,
    );
  }

  const timed = answered.filter((t) => wordsPerMinute(wordCount(t.text), t.durationMs) !== null);
  if (timed.length >= 2) {
    const avgWpm = Math.round(
      timed.reduce((s, t) => s + (wordsPerMinute(wordCount(t.text), t.durationMs) ?? 0), 0) / timed.length,
    );
    if (avgWpm >= 190) notes.push(`Pace: ~${avgWpm} words/min — a notch slower gives your best lines room to land.`);
    else if (avgWpm > 0 && avgWpm <= 100) notes.push(`Pace: ~${avgWpm} words/min — you can trust yourself to move a little quicker.`);
  }

  if (notes.length === 0) {
    notes.push(`Delivery read clean across ${answered.length} answers (avg ${avgWords} words) — keep this register in the real room.`);
  }
  return notes;
}
