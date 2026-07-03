import { NextResponse } from "next/server";
import { Packer } from "docx";
import { supabaseServer } from "@/lib/supabase/server";
import { buildResumeDoc } from "@/lib/resume/docx";

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
    .select("id, content, roles(company, role_title)")
    .eq("id", id)
    .single<{
      id: string;
      content: {
        summary?: string;
        bullets?: { text: string }[];
        keywords_injected?: string[];
      } | null;
      roles: { company: string; role_title: string } | null;
    }>();
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const c = artifact.content ?? {};
  const hasBody = Boolean(c.summary) || (Array.isArray(c.bullets) && c.bullets.length > 0);
  if (!hasBody) {
    return NextResponse.json({ error: "nothing to export yet" }, { status: 409 });
  }

  const headline = artifact.roles
    ? `${artifact.roles.role_title} — ${artifact.roles.company}`
    : undefined;
  const doc = buildResumeDoc({
    headline,
    summary: c.summary,
    bullets: c.bullets,
    keywords_injected: c.keywords_injected,
  });

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
