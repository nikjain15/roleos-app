/**
 * X5 — comp intelligence + offer co-pilot. Pure math, zero model calls.
 * Benchmarks come from STATED base ranges in RO's own corpus (always shown
 * with n — small n displayed, never hidden). Offer comparison is a transparent
 * weighted score: the arithmetic is the product, the decision stays the user's.
 */

export interface RangeStat {
  n: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

/** Percentiles over the midpoints of stated [lo, hi] ranges. Pure. */
export function summarizeRanges(ranges: Array<[number, number] | null | undefined>): RangeStat {
  const mids = ranges
    .filter((r): r is [number, number] => Array.isArray(r) && r.length === 2 && r[0] > 0 && r[1] >= r[0])
    .map(([lo, hi]) => (lo + hi) / 2)
    .sort((a, b) => a - b);
  if (mids.length === 0) return { n: 0, p25: null, p50: null, p75: null };
  const q = (p: number) => mids[Math.min(mids.length - 1, Math.floor(p * (mids.length - 1) + 0.5))];
  return { n: mids.length, p25: Math.round(q(0.25)), p50: Math.round(q(0.5)), p75: Math.round(q(0.75)) };
}

export interface Offer {
  name: string;
  base_usd: number;
  total_usd?: number | null;
  equity_note?: string;
  /** The user's own 1–5 reads — RO never invents these. */
  growth: number;
  life_fit: number;
  mission: number;
}

export interface Weights {
  comp: number; // weight on money (total if given, else base)
  growth: number;
  life_fit: number;
  mission: number;
}

export const DEFAULT_WEIGHTS: Weights = { comp: 40, growth: 25, life_fit: 25, mission: 10 };

export interface OfferScore {
  name: string;
  total: number; // 0–100
  parts: { comp: number; growth: number; life_fit: number; mission: number };
}

const clamp15 = (v: number) => Math.min(5, Math.max(1, v));

/**
 * Transparent weighted comparison. Money is normalized against the BEST offer
 * (best = 1.0); soft dimensions use the user's own 1–5 ratings scaled to 0–1.
 * Deterministic; ties are real ties.
 */
export function compareOffers(offers: Offer[], weights: Weights = DEFAULT_WEIGHTS): OfferScore[] {
  if (offers.length === 0) return [];
  const wSum = weights.comp + weights.growth + weights.life_fit + weights.mission || 1;
  const money = (o: Offer) => (typeof o.total_usd === "number" && o.total_usd > 0 ? o.total_usd : o.base_usd);
  const bestMoney = Math.max(...offers.map(money), 1);

  return offers
    .map((o) => {
      const parts = {
        comp: (money(o) / bestMoney) * (weights.comp / wSum) * 100,
        growth: ((clamp15(o.growth) - 1) / 4) * (weights.growth / wSum) * 100,
        life_fit: ((clamp15(o.life_fit) - 1) / 4) * (weights.life_fit / wSum) * 100,
        mission: ((clamp15(o.mission) - 1) / 4) * (weights.mission / wSum) * 100,
      };
      const round1 = (n: number) => Math.round(n * 10) / 10;
      return {
        name: o.name,
        total: round1(parts.comp + parts.growth + parts.life_fit + parts.mission),
        parts: { comp: round1(parts.comp), growth: round1(parts.growth), life_fit: round1(parts.life_fit), mission: round1(parts.mission) },
      };
    })
    .sort((a, b) => b.total - a.total);
}

export const OFFERS_STORAGE_KEY = "ro-offers-v1";

/** Parse stored offers — localStorage is untrusted; junk fields dropped. Pure. */
export function parseOffers(raw: string | null | undefined): Offer[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((o) => {
        if (!o || typeof o !== "object") return null;
        const x = o as Record<string, unknown>;
        const name = typeof x.name === "string" ? x.name.slice(0, 80) : null;
        const base = typeof x.base_usd === "number" && x.base_usd > 0 && x.base_usd < 10_000_000 ? x.base_usd : null;
        if (!name || base === null) return null;
        const num15 = (v: unknown) => (typeof v === "number" ? clamp15(v) : 3);
        return {
          name,
          base_usd: base,
          total_usd: typeof x.total_usd === "number" && x.total_usd > 0 && x.total_usd < 20_000_000 ? x.total_usd : null,
          equity_note: typeof x.equity_note === "string" ? x.equity_note.slice(0, 300) : "",
          growth: num15(x.growth),
          life_fit: num15(x.life_fit),
          mission: num15(x.mission),
        } as Offer;
      })
      .filter((o): o is Offer => o !== null)
      .slice(0, 3);
  } catch {
    return [];
  }
}
