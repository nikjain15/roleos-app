import type { SupabaseClient } from "@supabase/supabase-js";
import { runSkill } from "@/agent/skills/run";
import tasteSkill from "@/agent/skills/taste";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";

/**
 * Project decision_events → taste_model (the learning loop). Reads the user's
 * recent events + current taste, runs the taste skill, and upserts the derived
 * inferences (confidence + provenance). RLS-scoped via the caller's client.
 *
 * Returns the number of taste attributes written, for the UI to surface
 * "RO learned something about you."
 */
export async function projectTaste(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ updated: number }> {
  const { data: events } = await supabase
    .from("decision_events")
    .select("id, kind, action, subject_ref, payload, weight, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (!events?.length) return { updated: 0 };

  const { data: current } = await supabase
    .from("taste_model")
    .select("attribute, value, confidence, evidence, user_confirmed");

  const { verdict } = await runSkill(tasteSkill, {
    userId,
    data: { events, current: current ?? [] },
  });
  await logAgentRuns(userId, verdict.runs, { skill: "taste", judge: verdict });

  const inferences = parseModelJson<Array<Record<string, unknown>>>(verdict.finalOutput);
  if (!inferences || !Array.isArray(inferences) || !inferences.length) return { updated: 0 };

  const rows = inferences
    .filter((i) => typeof i.attribute === "string" && i.attribute)
    .map((i) => ({
      user_id: userId,
      attribute: i.attribute as string,
      value: { phrase: i.value, note: i.note ?? null },
      confidence: typeof i.confidence === "number" ? i.confidence : 0.5,
      evidence: i.evidence ?? [],
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return { updated: 0 };

  // Don't overwrite a user-confirmed attribute with a lower-confidence inference.
  const { error } = await supabase.from("taste_model").upsert(rows, { onConflict: "user_id,attribute" });
  if (error) return { updated: 0 };
  return { updated: rows.length };
}
