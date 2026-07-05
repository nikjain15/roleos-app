import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { parseConnectionsCsv, CONNECTIONS_CAP } from "@/lib/connections";

export const dynamic = "force-dynamic";

/**
 * The user's own people (slice X6, sources A+D). POST ingests either their
 * LinkedIn connections CSV (their data, via LinkedIn's own export) or one
 * hand-typed person; DELETE wipes everything in one click. Owner RLS on every
 * row; capped; zero external calls — we never touch LinkedIn or any vendor.
 */
const BodySchema = z
  .object({
    // Source A: raw CSV text from the user's own export (bounded).
    csv: z.string().min(1).max(2_000_000).optional(),
    // Source D: one person, typed by hand.
    manual: z
      .object({
        name: z.string().trim().min(1).max(200),
        company: z.string().trim().max(200).optional(),
        title: z.string().trim().max(200).optional(),
        email: z.string().trim().max(200).optional(),
        note: z.string().trim().max(2000).optional(),
      })
      .optional(),
  })
  .refine((b) => Boolean(b.csv) !== Boolean(b.manual), {
    message: "send exactly one of csv | manual",
  });

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;

  const { count } = await supabase
    .from("connections")
    .select("id", { count: "exact", head: true });
  const existing = count ?? 0;

  if (parsed.data.manual) {
    if (existing >= CONNECTIONS_CAP) {
      return NextResponse.json({ error: `you're at the ${CONNECTIONS_CAP}-person cap` }, { status: 400 });
    }
    const m = parsed.data.manual;
    const { error } = await supabase.from("connections").insert({
      user_id: user.id,
      name: m.name,
      company: m.company || null,
      title: m.title || null,
      email: m.email || null,
      note: m.note || "",
      source: "manual",
    });
    if (error) return NextResponse.json({ error: "couldn't save" }, { status: 500 });
    return NextResponse.json({ ok: true, added: 1, total: existing + 1 });
  }

  const rows = parseConnectionsCsv(parsed.data.csv!, CONNECTIONS_CAP - existing);
  if (!rows.length) {
    return NextResponse.json(
      { error: "couldn't find connections in that file — export 'Connections' from LinkedIn's data download and upload that CSV" },
      { status: 400 },
    );
  }
  const { error } = await supabase.from("connections").insert(
    rows.map((r) => ({
      user_id: user.id,
      name: r.name,
      company: r.company,
      title: r.title,
      email: r.email,
      source: "csv",
    })),
  );
  if (error) return NextResponse.json({ error: "couldn't save the list" }, { status: 500 });
  return NextResponse.json({ ok: true, added: rows.length, total: existing + rows.length });
}

/** Delete-my-connections: one click, everything gone (RLS scopes to own rows). */
export async function DELETE(): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { error } = await supabase.from("connections").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "couldn't delete" }, { status: 500 });
  return NextResponse.json({ ok: true, total: 0 });
}
