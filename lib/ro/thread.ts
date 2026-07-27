/**
 * RO conversation threads with rolling summaries (docs/specs/ro-memory.md, M2).
 * Keeps RO's back-and-forth per (user, surface) BOUNDED: a rolling summary of the
 * older turns + the last-k verbatim turns. So a long conversation costs the same
 * per reply as a short one — "notebook, not a recording." The summary fold runs on
 * the CHEAP tier (quick_tag) and only when turns overflow, so it's rarely called.
 *
 * The trim/fold logic is PURE (unit-tested); load/save are thin RLS-scoped bridges,
 * and the summarizer (a metered model call) is injected so the core stays testable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Turn {
  q: string;
  a: string;
}

export interface RoThread {
  surface: string;
  summary: string;
  turns: Turn[];
}

/** Keep the last k verbatim; anything older folds into the rolling summary. */
export const MAX_TURNS = 6;

/** Split turns into the recent ones we keep verbatim and the older overflow. */
export function overflowTurns(turns: Turn[], max = MAX_TURNS): { kept: Turn[]; overflow: Turn[] } {
  if (turns.length <= max) return { kept: turns, overflow: [] };
  const cut = turns.length - max;
  return { kept: turns.slice(cut), overflow: turns.slice(0, cut) };
}

/** The cheap-tier prompt that folds overflow turns into the running summary. */
export function summarizePrompt(prevSummary: string, overflow: Turn[]): { system: string; prompt: string } {
  return {
    system:
      "Fold the older conversation turns into a SHORT running summary (2-4 sentences, third person: " +
      "'they asked… RO said…'). Keep only durable, useful context — decisions, preferences, open threads. " +
      "Merge with the existing summary; drop small talk. Return ONLY the updated summary text.",
    prompt: `EXISTING SUMMARY:\n${prevSummary || "(none)"}\n\nOLDER TURNS TO FOLD IN:\n${overflow
      .map((t) => `Q: ${t.q}\nRO: ${t.a}`)
      .join("\n\n")}\n\nUpdated summary:`,
  };
}

/** Compact the thread for prompt injection (summary + the recent turns). */
export function toConversation(thread: RoThread): { summary: string; recent: Turn[] } | null {
  if (!thread.summary && thread.turns.length === 0) return null;
  return { summary: thread.summary, recent: thread.turns };
}

// ── bridges (RLS-scoped; fail-safe callers) ──────────────────────────────────

/** Load the (user, surface) thread, or an empty one if none / not migrated yet. */
export async function loadThread(supabase: SupabaseClient, userId: string, surface: string): Promise<RoThread> {
  const { data } = await supabase
    .from("ro_threads")
    .select("summary, turns")
    .eq("user_id", userId)
    .eq("surface", surface)
    .maybeSingle<{ summary: string; turns: Turn[] }>();
  return { surface, summary: data?.summary ?? "", turns: Array.isArray(data?.turns) ? data!.turns : [] };
}

/** A metered summarizer: fold overflow → new summary text + the model run to log. */
export type Summarizer = (prevSummary: string, overflow: Turn[]) => Promise<{ text: string; run: unknown }>;

/**
 * Append a turn, fold any overflow into the rolling summary (via the injected
 * summarizer), and upsert. Returns the model runs to meter (empty when no fold ran).
 */
export async function saveTurn(
  supabase: SupabaseClient,
  userId: string,
  surface: string,
  turn: Turn,
  prev: RoThread,
  summarize: Summarizer,
): Promise<unknown[]> {
  const all = [...prev.turns, turn];
  const { kept, overflow } = overflowTurns(all);

  let summary = prev.summary;
  const runs: unknown[] = [];
  if (overflow.length > 0) {
    const folded = await summarize(prev.summary, overflow);
    if (folded.text.trim()) summary = folded.text.trim();
    if (folded.run) runs.push(folded.run);
  }

  await supabase
    .from("ro_threads")
    .upsert({ user_id: userId, surface, summary, turns: kept, updated_at: new Date().toISOString() }, { onConflict: "user_id,surface" });
  return runs;
}
