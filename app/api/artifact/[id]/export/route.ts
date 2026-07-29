import { NextResponse } from "next/server";
import { Packer } from "docx";
import { supabaseServer } from "@/lib/supabase/server";
import { buildResumeDoc } from "@/lib/resume/docx";
import { parseResumeDoc } from "@/lib/resume/doc";
import { buildCoverDocx } from "@/lib/cover/docx";
import { parseCoverDoc, compileBody } from "@/lib/cover/doc";
import { exportEvent } from "@/lib/resume/feedback";

export const dynamic = "force-dynamic";

/**
 * Export a tailored résumé as DOCX (Slice 1, P0-7). Server-side render via the
 * `docx` lib — real headings + bullet paragraphs so the text is SELECTABLE in Word
 * (not an image), single-column ATS-safe layout. No model call.
 *
 * Workers-safe packing: `Packer.toBase64String` (jszip, pure JS) — avoids Node
 * `Buffer`/`Blob` which aren't guaranteed on the Workers runtime. PDF export is a
 * separate client-side print-to-PDF path (no headless Chrome on Workers).
 * RLS-scoped read: a user can only export their own artifact.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const format = new URL(req.url).searchParams.get("format") ?? "docx";
  if (format !== "docx") {
    return NextResponse.json(
      { error: "unsupported format; DOCX only (PDF is client-side print)" },
      { status: 400 },
    );
  }

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, type, content, roles(company, role_title)")
    .eq("id", id)
    .single<{
      id: string;
      type: string;
      content: {
        summary?: string;
        bullets?: { text: string }[];
        keywords_injected?: string[];
      } | null;
      roles: { company: string; role_title: string } | null;
    }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // J10.2: cover letters export as a standard business-letter DOCX (same ATS
  // rules as the résumé: single column, selectable text, no tables/images).
  if (artifact.type === "cover") {
    const doc = parseCoverDoc(artifact.content);
    if (compileBody(doc).trim().length < 40) {
      return NextResponse.json({ error: "nothing to export yet" }, { status: 409 });
    }
    const name =
      (user.user_metadata?.name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined);
    const docx = buildCoverDocx({
      name,
      roleLabel: artifact.roles ? `${artifact.roles.role_title} — ${artifact.roles.company}` : undefined,
      dateLine: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      greeting: doc.greeting,
      paragraphs: doc.sections.map((s) => s.text),
      signoff: doc.signoff,
    });
    const b64 = await Packer.toBase64String(docx);
    const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const file = `cover-letter${artifact.roles ? "-" + slug(artifact.roles.company) : ""}.docx`;
    return new Response(bin, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const c = artifact.content ?? {};
  const parsed = parseResumeDoc(c);
  const hasBody = Boolean(parsed.summary) || parsed.experience.some((e) => e.lines.length > 0);
  if (!hasBody) {
    return NextResponse.json({ error: "nothing to export yet" }, { status: 409 });
  }

  const headline = artifact.roles
    ? `${artifact.roles.role_title} — ${artifact.roles.company}`
    : undefined;
  const doc = buildResumeDoc({
    headline,
    summary: parsed.summary,
    experience: parsed.experience.map((e) => ({
      company: e.company,
      title: e.title,
      dates: e.dates,
      lines: e.lines.map((l) => ({ text: l.text })),
    })),
    keywords_injected: parsed.keywords_injected,
  });

  // P4 calibration: exporting is trust — they used the draft. Best-effort, pre-stream.
  await supabase.from("decision_events").insert({ ...exportEvent(id, format), user_id: user.id });

  const base64 = await Packer.toBase64String(doc);
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  const filename = `resume${artifact.roles ? "-" + slug(artifact.roles.company) : ""}.docx`;

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "role";
}
