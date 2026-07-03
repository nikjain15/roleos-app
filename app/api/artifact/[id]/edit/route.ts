import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { mapFlags } from "@/lib/resume/flags";

export const dynamic = "force-dynamic";

/**
 * Résumé editor autosave (Slice 1, P0-4/P0-6). Persists the edited content to the
 * artifact row (RLS-scoped: the cookie-bound client can only write auth.uid()'s
 * rows). Recomputes the live truth status from remaining (unresolved) violations
 * and reflects it in `status` so a reload shows the same clean/needs-eyes state.
 *
 * Autosave is content-only — it writes NO decision_event per keystroke (those are
 * reserved for meaningful signals: flag resolution and approve, via /decision and
 * /reground). zod-validated (D6). Never flips an already-`sent` artifact.
 */
const BulletSchema = z.object({
  text: z.string(),
  rationale: z.string().optional(),
  evidence: z.string().optional(),
});

const ContentSchema = z.object({
  summary: z.string().optional(),
  bullets: z.array(BulletSchema).max(60).optional(),
  keywords_injected: z.array(z.string()).max(100).optional(),
  fit_lift: z.string().optional(),
  truth_note: z.string().optional(),
  resolved_violations: z.array(z.string()).max(100).optional(),
  original: z
    .object({ summary: z.string().optional(), bullets: z.array(BulletSchema).max(60).optional() })
    .optional(),
});

const BodySchema = z.object({ content: ContentSchema });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, status, content, provenance")
    .eq("id", id)
    .single<{ id: string; status: string; content: Record<string, unknown>; provenance: { truth?: { violations?: string[] } | null } | null }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (artifact.status === "sent") {
    return NextResponse.json({ error: "a sent résumé can't be edited" }, { status: 409 });
  }

  // Snapshot the pristine draft the first time we save, so "revert to original"
  // survives reloads (P0-3). Never overwrite an existing snapshot.
  const incoming = parsed.data.content;
  const existing = artifact.content ?? {};
  const merged: Record<string, unknown> = { ...existing, ...incoming };
  if (!("original" in existing) && !incoming.original) {
    merged.original = { summary: existing.summary, bullets: existing.bullets };
  }

  // Live "grounded" is a DERIVED truth state (unresolved violations), returned for
  // the client's status pill + export gating. We deliberately do NOT mutate the
  // artifact `status` here: grounding ≠ approval. "Approved" stays the user's
  // explicit "make it mine" (ArtifactActions), the single approval path — autosave
  // must not silently approve or reorder the pipeline. (Pipeline-status semantics
  // for grounded-but-unapproved are a separate product call, out of this slice.)
  const violations = artifact.provenance?.truth?.violations ?? [];
  const resolved = (merged.resolved_violations as string[] | undefined) ?? [];
  const bullets = (merged.bullets as { text: string }[] | undefined) ?? [];
  const { grounded } = mapFlags(bullets, violations, resolved);

  const { error } = await supabase.from("artifacts").update({ content: merged }).eq("id", id);
  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });

  return NextResponse.json({ ok: true, status: artifact.status, grounded });
}
