/**
 * RO's durable notebook (docs/specs/ro-memory.md, M1). Turns the user's real
 * actions (decision_events) into a small set of TYPED NOTES, stores them embedded
 * in `ro_memory`, and recalls only the top-k RELEVANT ones per RO reply.
 *
 * The honest resolution of the user's three requirements:
 *  • lose nothing — everything is stored (append-only; superseding never deletes);
 *  • bounded cost — only the top-k relevant notes are ever read into a prompt;
 *  • never wrong/stale — notes are DERIVED from real actions (not invented),
 *    confidence hardens only on repetition, and recall skips superseded notes.
 *
 * `deriveNotes` is PURE (unit-tested). Embedding + storage + recall are thin
 * RLS-scoped bridges (the same `bge` provider as everything else, so the vectors
 * share one space). A note is DATA — it can never trigger an outward action.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { embeddings } from "@/lib/embeddings";

export type RoNoteKind = "identity" | "target" | "style" | "preference" | "correction";

/** A note ready to write (pre-embedding). */
export interface RoNoteDraft {
  scope: string; // 'global' | 'role:<id>' | 'artifact:<id>'
  kind: RoNoteKind;
  text: string;
  confidence: number; // 0..1
  sourceEventId?: string;
}

/** A note recalled from the notebook. */
export interface RoNote {
  id: string;
  text: string;
  kind: string;
  scope: string;
  confidence: number;
  distance: number;
}

/** The decision_events shape deriveNotes reads (a slice of the row). */
export interface DerivableEvent {
  id?: string;
  kind: string;
  action: string;
  payload?: Record<string, unknown> | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Derive candidate notes from real user actions. PURE + honest: each note traces
 * to a specific event, never invented. Deduped by text (highest confidence wins),
 * so a repeated behavior surfaces once — hardened, not duplicated.
 */
export function deriveNotes(events: DerivableEvent[]): RoNoteDraft[] {
  const byText = new Map<string, RoNoteDraft>();
  const add = (d: RoNoteDraft) => {
    const key = d.text.toLowerCase();
    const prev = byText.get(key);
    // Repeat sighting hardens confidence; keep the strongest.
    if (!prev || d.confidence > prev.confidence) byText.set(key, d);
  };

  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;

    // Explicit profile corrections — the highest-signal input there is.
    if (e.kind === "profile" && e.action === "correct") {
      const field = str(p.field);
      const to = str(p.to);
      if (field && to) {
        if (field.startsWith("target")) add({ scope: "global", kind: "target", text: `Targets ${to}`, confidence: 0.9, sourceEventId: e.id });
        else if (field === "headline") add({ scope: "global", kind: "identity", text: `Positions as: ${to}`, confidence: 0.85, sourceEventId: e.id });
        else if (field === "seniority") add({ scope: "global", kind: "identity", text: `Seniority: ${to}`, confidence: 0.85, sourceEventId: e.id });
      }
    }
    // "That skill isn't me" — a correction RO should never re-suggest.
    if (e.kind === "profile" && e.action === "reject") {
      const value = str(p.value);
      if (value) add({ scope: "global", kind: "correction", text: `Not their skill: ${value}`, confidence: 0.9, sourceEventId: e.id });
    }
    // Résumé tune — a directed style preference ("make the founder years pop").
    if (e.kind === "resume" && e.action === "edit" && p.signal === "tune") {
      const instruction = str(p.instruction);
      if (instruction) {
        const scope = str(p.artifactId) ? `artifact:${p.artifactId}` : "global";
        add({ scope, kind: "style", text: `When tailoring, they asked: "${instruction}"`, confidence: 0.6, sourceEventId: e.id });
      }
    }
  }

  return [...byText.values()];
}

/**
 * Idempotency filter (PURE): of freshly-derived drafts, keep only those NOT already
 * in the notebook (matched case-insensitively by text). So syncing repeatedly never
 * duplicates a note — a repeated behavior stays one note, not many.
 */
export function newNotes(drafts: RoNoteDraft[], existingTexts: string[]): RoNoteDraft[] {
  const seen = new Set(existingTexts.map((t) => t.trim().toLowerCase()));
  const out: RoNoteDraft[] = [];
  for (const d of drafts) {
    const key = d.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); // also dedupe within this batch
    out.push(d);
  }
  return out;
}

// ── storage + recall (thin RLS-scoped bridges) ───────────────────────────────

/** Embed the note texts and append them to the notebook (server-scoped user_id). */
export async function writeNotes(
  supabase: SupabaseClient,
  userId: string,
  drafts: RoNoteDraft[],
): Promise<number> {
  if (drafts.length === 0) return 0;
  const vectors = await embeddings().embed(drafts.map((d) => d.text));
  const rows = drafts.map((d, i) => ({
    user_id: userId,
    scope: d.scope,
    kind: d.kind,
    text: d.text,
    confidence: d.confidence,
    source_event_id: d.sourceEventId ?? null,
    embedding: vectors[i],
  }));
  const { error } = await supabase.from("ro_memory").insert(rows);
  if (error) throw new Error(`ro_memory insert: ${error.message}`);
  return rows.length;
}

/**
 * Recall the top-k notes relevant to `query` (RLS: the caller's own notebook
 * only; superseded + unembedded notes skipped). Bounded — the O(1)-per-reply cost.
 */
export async function recallMemory(supabase: SupabaseClient, query: string, k = 6): Promise<RoNote[]> {
  const q = query.trim();
  if (!q) return [];
  const [vec] = await embeddings().embed([q.slice(0, 2000)]);
  const { data, error } = await supabase.rpc("match_ro_memory", { query_embedding: vec, match_count: k });
  if (error) throw new Error(`match_ro_memory: ${error.message}`);
  return (data ?? []) as RoNote[];
}

/**
 * Bring the notebook up to date from the user's real actions: read recent
 * decision_events → derive notes → keep only the ones not already stored → embed +
 * write. Idempotent (safe to call repeatedly; usually writes 0 after the backfill).
 * RLS-scoped. Returns how many new notes were written. Callers run this fail-safe.
 */
export async function syncMemory(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: events } = await supabase
    .from("decision_events")
    .select("id, kind, action, payload")
    .in("kind", ["profile", "resume"])
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<DerivableEvent[]>();

  const drafts = deriveNotes(events ?? []);
  if (drafts.length === 0) return 0;

  const { data: existing } = await supabase
    .from("ro_memory")
    .select("text")
    .is("superseded_by", null)
    .returns<{ text: string }[]>();

  const fresh = newNotes(drafts, (existing ?? []).map((r) => r.text));
  return writeNotes(supabase, userId, fresh);
}
