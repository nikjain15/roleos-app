import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { runSkill } from "@/agent/skills/run";
import reviseCover from "@/agent/skills/revise_cover";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import { parseCoverDoc, compileBody, toContent, type CoverDoc } from "@/lib/cover/doc";
import { applyCoverTune } from "@/lib/cover/revise";

export const dynamic = "force-dynamic";
// One short truth-gated rewrite of a single paragraph — but gated model calls can
// still run long; use the same ceiling as the other model routes.
export const maxDuration = 300;

/**
 * Per-section cover-letter personalization (J10.2). POST tunes ONE section on an
 * instruction (preset chip or freeform "tell RO how") through the truth gate;
 * scope + ✓-keep locks are ENFORCED in pure code (lib/cover/revise), never
 * trusted to the model. PATCH saves the user's own edits + keep-locks (no model).
 * RLS-scoped; a tune of an approved letter drops it back to draft so the user
 * re-approves what changed. No send.
 */
const Params = z.object({ id: z.string().uuid() });

type ArtifactRow = {
  id: string;
  role_id: string | null;
  type: string;
  status: string;
  content: unknown;
  provenance: Record<string, unknown> | null;
};

async function loadCover(supabase: Awaited<ReturnType<typeof supabaseServer>>, id: string) {
  const { data } = await supabase
    .from("artifacts")
    .select("id, role_id, type, status, content, provenance")
    .eq("id", id)
    .single<ArtifactRow>();
  if (!data || data.type !== "cover") return null;
  return data;
}

async function saveDoc(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  artifact: ArtifactRow,
  doc: CoverDoc,
  extraProvenance: Record<string, unknown> = {},
  opts: { textChanged?: boolean } = {},
) {
  // Letter text changed — an approved letter goes back to draft for re-approval.
  // (A ✓-keep toggle alone doesn't demote it.)
  const status = artifact.status === "approved" && opts.textChanged !== false ? "draft" : artifact.status;
  await supabase
    .from("artifacts")
    .update({
      content: toContent(doc),
      provenance: { ...(artifact.provenance ?? {}), ...extraProvenance },
      status,
    })
    .eq("id", artifact.id);
  return status;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = Params.safeParse(await ctx.params);
  if (!params.success) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(
    req,
    z.object({ sectionId: z.string().min(1).max(40), instruction: z.string().min(2).max(500) }),
  );
  if (!parsed.ok) return parsed.response;
  const { sectionId, instruction } = parsed.data;

  const artifact = await loadCover(supabase, params.data.id);
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!artifact.role_id) return NextResponse.json({ error: "no role" }, { status: 400 });

  const doc = parseCoverDoc(artifact.content);
  const section = doc.sections.find((s) => s.id === sectionId);
  if (!section) return NextResponse.json({ error: "section not found" }, { status: 404 });
  if (section.locked) return NextResponse.json({ error: "that section is ✓-kept — unlock it to tune it" }, { status: 400 });

  const [{ data: mp }, { data: role }] = await Promise.all([
    supabase.from("master_profile").select("data").eq("user_id", user.id).single(),
    supabase.from("roles").select("id, company, role_title, must_haves").eq("id", artifact.role_id).single(),
  ]);
  const profileRaw = (mp?.data as { raw?: string } | null)?.raw;
  if (!profileRaw || !role) return NextResponse.json({ error: "missing profile or role" }, { status: 400 });

  const { verdict } = await runSkill(reviseCover, {
    userId: user.id,
    data: {
      role,
      profile: profileRaw,
      groundTruth: profileRaw,
      section: { id: section.id, label: section.label, text: section.text },
      letter: compileBody(doc),
      instruction,
    },
  });
  await logAgentRuns(user.id, verdict.runs, { skill: "revise_cover", judge: verdict });

  const out = parseModelJson<{ text?: string; rationale?: string; note?: string }>(verdict.finalOutput);
  const result = applyCoverTune(doc, sectionId, out?.text ?? "", { note: out?.note, rationale: out?.rationale });
  if (!result.applied) return NextResponse.json({ error: result.note }, { status: 422 });

  const status = await saveDoc(supabase, artifact, result.doc, {
    last_tune: { sectionId, instruction, gate_status: verdict.status, truth: verdict.truth },
  });

  return NextResponse.json({
    ok: true,
    status,
    content: toContent(result.doc),
    note: result.note,
    flags: verdict.truth && verdict.truth.ok === false ? verdict.truth.violations : [],
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = Params.safeParse(await ctx.params);
  if (!params.success) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(
    req,
    z.object({
      subject: z.string().max(300).optional(),
      greeting: z.string().max(200).optional(),
      signoff: z.string().max(200).optional(),
      sections: z
        .array(z.object({ id: z.string().min(1).max(40), text: z.string().max(4000).optional(), locked: z.boolean().optional() }))
        .max(10)
        .optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;
  const edits = parsed.data;

  const artifact = await loadCover(supabase, params.data.id);
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const doc = parseCoverDoc(artifact.content);
  const byId = new Map((edits.sections ?? []).map((s) => [s.id, s]));
  const next: CoverDoc = {
    ...doc,
    subject: edits.subject ?? doc.subject,
    greeting: edits.greeting ?? doc.greeting,
    signoff: edits.signoff ?? doc.signoff,
    sections: doc.sections.map((s) => {
      const e = byId.get(s.id);
      if (!e) return s;
      return { ...s, text: e.text !== undefined ? e.text : s.text, locked: e.locked !== undefined ? e.locked : s.locked };
    }),
  };
  const textChanged =
    compileBody(next) !== compileBody(doc) || next.subject !== doc.subject;
  const status = await saveDoc(supabase, artifact, next, {}, { textChanged });
  return NextResponse.json({ ok: true, status, content: toContent(next) });
}
