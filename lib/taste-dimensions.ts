import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveDimensions, DIMENSIONS, type DimensionInference, type Signals } from "@/lib/dimensions";
import { ratesFromTracker } from "@/lib/goal";

/**
 * Server bridge for the 15-dimension model (Slice 8). Aggregates the user's real
 * signals (RLS-scoped), derives the dimensions (pure `deriveDimensions`), overlays
 * any user corrections from `taste_dimensions`, and caches the snapshot. Transparent
 * + correctable: a user-confirmed row wins over the derived inference.
 */
export interface DimView extends DimensionInference {
  userConfirmed: boolean;
  userNote: string | null;
}

export async function gatherSignals(supabase: SupabaseClient): Promise<Signals> {
  const [{ data: events }, rates, { data: profile }, { data: goal }] = await Promise.all([
    supabase.from("decision_events").select("kind, action, payload").limit(500),
    ratesFromTracker(supabase),
    supabase.from("profiles").select("notif_settings").maybeSingle<{ notif_settings: { cadence?: string } | null }>(),
    supabase.from("goals").select("intensity").eq("status", "active").maybeSingle<{ intensity: Signals["intensity"] }>(),
  ]);

  const evs = events ?? [];
  const curate = (c: string) =>
    evs.filter((e) => e.kind === "match" && (e.payload as { curate?: string } | null)?.curate === c).length;
  const resumeBy = (actions: string[]) =>
    evs.filter((e) => e.kind === "resume" && actions.includes(e.action as string)).length;

  return {
    saves: curate("save"),
    dismisses: curate("dismiss"),
    pursues: curate("pursue"),
    resumeEdits: resumeBy(["edit", "correct"]),
    resumeApproves: resumeBy(["approve"]),
    rates,
    cadence: profile?.notif_settings?.cadence ?? null,
    intensity: goal?.intensity ?? null,
  };
}

interface StoredDim {
  dimension: number;
  inference: { text?: string; basis?: string } | null;
  confidence: number;
  user_note: string | null;
  user_confirmed: boolean;
}

/** Derive + overlay stored user corrections. Returns the full 15-dim view. */
export async function loadDimensions(supabase: SupabaseClient): Promise<DimView[]> {
  const signals = await gatherSignals(supabase);
  const derived = deriveDimensions(signals);

  const { data: stored } = await supabase
    .from("taste_dimensions")
    .select("dimension, inference, confidence, user_note, user_confirmed")
    .returns<StoredDim[]>();
  const byDim = new Map((stored ?? []).map((s) => [s.dimension, s]));

  return derived.map((d) => {
    const s = byDim.get(d.id);
    if (s?.user_confirmed) {
      // The user's correction wins — high confidence, their words.
      return {
        ...d,
        inference: s.user_note ?? s.inference?.text ?? d.inference,
        confidence: 0.95,
        basis: "you told RO this",
        userConfirmed: true,
        userNote: s.user_note,
      };
    }
    return { ...d, userConfirmed: false, userNote: s?.user_note ?? null };
  });
}

/** Cache the derived snapshot (preserves user overrides — only writes derived fields). */
export async function cacheDimensions(supabase: SupabaseClient, userId: string): Promise<void> {
  const signals = await gatherSignals(supabase);
  const derived = deriveDimensions(signals);
  const rows = derived.map((d) => ({
    user_id: userId,
    dimension: d.id,
    inference: { text: d.inference, basis: d.basis },
    confidence: d.confidence,
    provenance: { basis: d.basis },
    updated_at: new Date().toISOString(),
  }));
  // onConflict update of derived fields only — user_note/user_confirmed untouched.
  await supabase
    .from("taste_dimensions")
    .upsert(rows, { onConflict: "user_id,dimension", ignoreDuplicates: false });
}

export { DIMENSIONS };
