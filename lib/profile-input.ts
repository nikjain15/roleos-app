/**
 * Is there enough REAL signal in an onboarding input to match on?
 *
 * The honest-input guard (ro-voice.html "thin / junk input" recovery). A bare
 * LinkedIn URL can't be fetched server-side (LinkedIn blocks it), so matching on
 * the link text is matching on noise — and RO must NOT fake confidence off it.
 * This catches URL-only / too-thin inputs so the route can ask for real content
 * instead of fabricating a shortlist.
 */
export interface InputAssessment {
  ok: boolean;
  /** Count of real alphabetic words after URLs are stripped out. */
  realWords: number;
  /** Did the input contain a URL (changes RO's wording)? */
  hadUrl: boolean;
}

/** Below this many real words, there isn't enough to match on honestly. */
export const MIN_REAL_WORDS = 12;

const URL_RE = /(https?:\/\/|www\.)\S+/gi;
const WORD_RE = /[a-zA-Z][a-zA-Z'’-]{1,}/g;

export function assessProfileInput(text: string): InputAssessment {
  const hadUrl = /(https?:\/\/|www\.)\S+/i.test(text);
  const stripped = text.replace(URL_RE, " ");
  const realWords = (stripped.match(WORD_RE) ?? []).length;
  return { ok: realWords >= MIN_REAL_WORDS, realWords, hadUrl };
}

/** RO's honest "give me real content" message — acknowledge → truth → forward. */
export function thinInputMessage(a: InputAssessment): string {
  if (a.hadUrl) {
    return "All I got was a link — and I can't read the page behind it (LinkedIn and most sites block that). Paste the actual words instead: your CV text, or your LinkedIn “About” plus a couple of roles, or just a few honest lines about what you've built and what you want next. Matching you off a bare URL would just be me guessing — and I'd rather be sharp than fake it.";
  }
  return "I'll be straight — there's not much here for me to go on yet, and that's okay. Give me a few real lines: what you've built, and the kind of role you're after next. Two or three honest sentences and I'll be sharp.";
}
