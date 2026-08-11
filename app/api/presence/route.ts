import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { paramsForSource } from "@/lib/presence/apidirect";
import { DEFAULT_SOURCES } from "@/lib/presence/defaults";

export const dynamic = "force-dynamic";

/**
 * Presence console actions, all RLS-scoped writes to the user's own rows:
 *   feedback     — worth/maybe/no/posted + drafted comment text. This is the
 *                  accept-reject-skip signal phase 2 trains on, captured from
 *                  day one on purpose (the buttons exist before the drafter).
 *   add_source   — one saved search; a person to watch is a row, not a deploy.
 *   toggle_source— enable/disable without losing history.
 *   seed_sources — one-click import of the proven local source set, offered
 *                  when the user has none.
 *   settings     — the Filter view's thresholds, merged over defaults at
 *                  collect time.
 *
 * Nothing here posts, sends, or contacts anything. Comments leave via the
 * user's own clipboard (human-gated outward, CI-enforced elsewhere).
 */
const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("feedback"),
    url: z.string().url().max(1000),
    verdict: z.enum(["worth", "maybe", "no", "posted"]).optional(),
    note: z.string().max(4000).optional(),
    posted_at: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("add_source"),
    platform: z.enum(["linkedin", "twitter", "reddit"]),
    type: z.enum(["keyword", "author", "company", "title", "industry", "mentions"]),
    value: z.string().min(1).max(500),
    query: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("toggle_source"),
    id: z.string().uuid(),
    enabled: z.boolean(),
  }),
  z.object({ action: z.literal("seed_sources") }),
  z.object({
    action: z.literal("settings"),
    scoring: z.object({
      max_age_hours: z.number().int().min(1).max(720).optional(),
      max_engagement: z.number().int().min(1).max(100000).optional(),
      min_score: z.number().int().min(-50).max(100).optional(),
      top_n: z.number().int().min(1).max(100).optional(),
      dead_after_hours: z.number().int().min(1).max(720).optional(),
    }),
  }),
]);

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (body.action === "feedback") {
    const { error } = await supabase.from("presence_feedback").upsert(
      {
        user_id: user.id,
        url: body.url,
        ...(body.verdict ? { verdict: body.verdict } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.posted_at ? { posted_at: body.posted_at } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,url" },
    );
    if (error) return NextResponse.json({ error: "couldn't save feedback" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add_source") {
    // Enforce the real API constraints at insert time rather than letting the
    // nightly run fail: author max 5, company/industry numeric IDs, title
    // needs a query. All found live 2026-08-11; none are documented.
    try {
      paramsForSource({ id: null, slug: "", platform: body.platform, type: body.type, value: body.value, query: body.query ?? null });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
    const slugBase = `${body.platform === "twitter" ? "x" : body.platform.slice(0, 2)}-${body.type.slice(0, 4)}-${body.value
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28)}`;
    const { data: existing } = await supabase.from("presence_sources").select("slug").like("slug", `${slugBase}%`);
    const taken = new Set((existing ?? []).map((r) => r.slug as string));
    let slug = slugBase;
    for (let n = 2; taken.has(slug); n++) slug = `${slugBase}-${n}`;

    const { error } = await supabase.from("presence_sources").insert({
      user_id: user.id,
      slug,
      platform: body.platform,
      type: body.type,
      value: body.value,
      ...(body.query ? { query: body.query } : {}),
      note: `Added from the console ${new Date().toISOString().slice(0, 10)}.`,
    });
    if (error) return NextResponse.json({ error: "couldn't add the source" }, { status: 500 });
    return NextResponse.json({ ok: true, slug });
  }

  if (body.action === "toggle_source") {
    const { error } = await supabase
      .from("presence_sources")
      .update({ enabled: body.enabled })
      .eq("id", body.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "couldn't update the source" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "seed_sources") {
    const { count } = await supabase
      .from("presence_sources")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "sources already exist; seeding is only for an empty list" }, { status: 400 });
    }
    const { error } = await supabase.from("presence_sources").insert(
      DEFAULT_SOURCES.map((s) => ({
        user_id: user.id,
        slug: s.slug,
        platform: s.platform,
        type: s.type,
        value: s.value,
        ...(s.query ? { query: s.query } : {}),
        enabled: s.enabled,
        note: s.note,
      })),
    );
    if (error) return NextResponse.json({ error: "couldn't seed sources" }, { status: 500 });
    return NextResponse.json({ ok: true, seeded: DEFAULT_SOURCES.length });
  }

  // settings
  const { error } = await supabase.from("presence_settings").upsert(
    { user_id: user.id, scoring: body.scoring, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: "couldn't save settings" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
