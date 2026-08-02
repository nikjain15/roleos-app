/**
 * THE PRIVACY / PII SCAN (findings SH9 and A4): a real deterministic control,
 * replacing the honest stub that used to sit in `runGuardrails`.
 *
 * The old comment in `agent/quality-gate.ts` said the privacy check was "stubbed
 * honestly here, not faked as passing". That was true about the comment and false
 * about the effect. `runGuardrails` returned `ok: true` when nothing else failed,
 * and `computeConfidence` reads `guardrailsOk` as a SATISFIED HARD GATE. So a
 * draft that leaked a third party's phone number scored `strong`. Honesty in a
 * comment does not survive being wired to a boolean that means "checked".
 *
 * WHY THIS IS NOT JUST "FIND PII AND FAIL".
 *
 * RoleOS's whole job is writing a document ABOUT a person, from that person's own
 * CV. A résumé legitimately carries its owner's email address, phone number, and
 * location. A scan that failed on those would fail on every correct output, and a
 * gate that fails on everything gets disabled within a week. That is precisely why
 * the check was stubbed rather than implemented, and it is the real problem to
 * solve, not an excuse.
 *
 * So the question this module actually asks is the one that matters:
 *
 *   1. Does the output contain personal data that is NOT the candidate's own?
 *      Anything traceable to the ground-truth profile is theirs and is expected.
 *      Anything that is not is a leak: another candidate's contact details, a
 *      referee's number, an interviewer's address, text hallucinated from
 *      somewhere else. That is `third_party`, and it FAILS.
 *   2. Does the output contain a category RO must never emit at all, whether or
 *      not the candidate pasted it in? A payment card number, a national
 *      identifier, a bank account. Nobody needs these in a résumé or a cover
 *      letter, and repeating one back multiplies the places it exists. That is
 *      `never_emit`, and it FAILS regardless of the ground truth.
 *   3. Can the question be answered at all? With no ground truth supplied there
 *      is nothing to compare against, so PII in the output cannot be classified
 *      as the candidate's own or someone else's. That is `indeterminate`, and it
 *      is the case the old stub silently reported as a pass.
 *
 * FAIL-CLOSED RULE. `indeterminate` is never reported as a satisfied control. It
 * does not hard-fail the guardrails (that would block every ungrounded skill,
 * which is most of them, for no security benefit), but it is surfaced to the
 * quality gate, which caps confidence below `strong`. The invariant that matters:
 * a control that could not be evaluated can never be counted as having passed.
 *
 * Pure and dependency-free: no network, no model call, runs on Workers.
 */

export type PrivacyStatus = "clean" | "flagged" | "indeterminate";

export type PrivacyCategory =
  | "email"
  | "phone"
  | "payment_card"
  | "national_id"
  | "bank_account";

export type PrivacyDisposition = "own" | "third_party" | "never_emit" | "unclassified";

export interface PrivacyFinding {
  category: PrivacyCategory;
  disposition: PrivacyDisposition;
  /** Redacted for logs. The raw value is never returned or persisted. */
  redacted: string;
}

export interface PrivacyResult {
  status: PrivacyStatus;
  findings: PrivacyFinding[];
  /** Human-readable guardrail failures. Empty unless status is "flagged". */
  failures: string[];
  /** True when there was no ground truth to classify against. */
  groundTruthAvailable: boolean;
}

/** Detectors. Deliberately conservative: a false positive here blocks a user's work. */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;

/**
 * Phone numbers are the hard one. A résumé draft is full of numbers that are not
 * phone numbers: "grew ARR 45% to $12.4M", "2019-2023", "led 12 engineers". The
 * shape required here is a genuinely phone-like run: an explicit international
 * prefix or a parenthesised area code or at least two separator groups, and 9 to
 * 15 digits in total. Bare year ranges and money figures do not qualify.
 */
const PHONE_RE = new RegExp(
  [
    // an explicit international prefix or a parenthesised area code, then a run
    // of digits: "+44 20 7946 0958", "+1 (415) 555-0142", "(020) 7946 0958"
    String.raw`(?:\+\d{1,3}[\s.()-]{0,3}|\(\d{2,4}\)[\s.-]{0,2})(?:\d[\s.()-]{0,2}){5,13}\d`,
    // or three-plus separated digit groups: "020 7946 0958", "415-555-0142".
    // Two groups is not enough, which is what keeps "2019-2023" out.
    String.raw`\b\d{2,4}[\s.-]\d{2,4}[\s.-]\d{2,5}(?:[\s.-]\d{2,5})?\b`,
  ].join("|"),
  "g",
);

/** 13 to 19 digits in card-like grouping. Confirmed by Luhn before it counts. */
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

/** US SSN, UK National Insurance, and the generic "NNN-NN-NNNN" shape. */
const NATIONAL_ID_RE = /\b(?:\d{3}-\d{2}-\d{4}|[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D])\b/g;

/** IBAN: two letters, two check digits, then 11 to 30 alphanumerics. */
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

/** Categories RO must never emit, whatever the ground truth says. */
const NEVER_EMIT: PrivacyCategory[] = ["payment_card", "national_id", "bank_account"];

function luhnValid(digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Comparison key: case and punctuation insensitive, so "+44 20 7946" matches "442079460". */
function key(value: string, category: PrivacyCategory): string {
  if (category === "email") return value.toLowerCase();
  return value.replace(/\D/g, "");
}

function redact(value: string, category: PrivacyCategory): string {
  if (category === "email") {
    const [user, domain] = value.split("@");
    return `${user.slice(0, 2)}***@${domain ?? "***"}`;
  }
  const digits = value.replace(/\D/g, "");
  return `***${digits.slice(-3)}`;
}

interface Candidate {
  category: PrivacyCategory;
  value: string;
}

function collect(text: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (category: PrivacyCategory, value: string) => {
    const k = `${category}:${key(value, category)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ category, value });
  };

  for (const m of text.matchAll(EMAIL_RE)) push("email", m[0]);
  for (const m of text.matchAll(NATIONAL_ID_RE)) push("national_id", m[0]);
  for (const m of text.matchAll(IBAN_RE)) push("bank_account", m[0]);
  for (const m of text.matchAll(CARD_RE)) {
    if (luhnValid(m[0])) push("payment_card", m[0]);
  }
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) continue;
    // A Luhn-valid long run was already claimed as a card; do not double count.
    if (digits.length >= 13 && luhnValid(m[0])) continue;
    push("phone", m[0].trim());
  }
  return out;
}

/**
 * Scan `output` for personal data, classifying each hit against `groundTruth`
 * (the candidate's own master profile) where one is available.
 */
export function scanPrivacy(output: string, groundTruth?: string): PrivacyResult {
  const groundTruthAvailable = typeof groundTruth === "string" && groundTruth.trim().length > 0;
  const candidates = collect(output);

  if (candidates.length === 0) {
    // Nothing personal in the output at all. This is a genuine clean result and
    // does not depend on having a ground truth, so it is not indeterminate.
    return { status: "clean", findings: [], failures: [], groundTruthAvailable };
  }

  const ownKeys = new Set<string>();
  if (groundTruthAvailable) {
    for (const c of collect(groundTruth!)) ownKeys.add(`${c.category}:${key(c.value, c.category)}`);
  }

  const findings: PrivacyFinding[] = [];
  const failures: string[] = [];
  let indeterminate = false;

  for (const c of candidates) {
    const redacted = redact(c.value, c.category);
    if (NEVER_EMIT.includes(c.category)) {
      findings.push({ category: c.category, disposition: "never_emit", redacted });
      failures.push(
        `privacy: output contains a ${c.category.replace("_", " ")} (${redacted}); RO never emits these, even from the candidate's own paste`,
      );
      continue;
    }
    if (!groundTruthAvailable) {
      findings.push({ category: c.category, disposition: "unclassified", redacted });
      indeterminate = true;
      continue;
    }
    const own = ownKeys.has(`${c.category}:${key(c.value, c.category)}`);
    findings.push({ category: c.category, disposition: own ? "own" : "third_party", redacted });
    if (!own) {
      failures.push(
        `privacy: output contains a ${c.category} (${redacted}) that does not appear in the candidate's own profile`,
      );
    }
  }

  if (failures.length) return { status: "flagged", findings, failures, groundTruthAvailable };
  if (indeterminate) return { status: "indeterminate", findings, failures: [], groundTruthAvailable };
  return { status: "clean", findings, failures: [], groundTruthAvailable };
}
