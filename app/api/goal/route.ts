import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { liveSupply, planFor, ratesFromTracker, todayISO, type GoalRow } from "@/lib/goal";

export const dynamic = "force-dynamic";

/**
 * Goal Setter API (goal-engine.md §1). Create/update the user's ONE active goal;
 * every write recomputes + caches the pace plan on the row. RLS-scoped (owner
 * insert/update via the cookie client). zod-validated (D6). Setting a goal is a
 * user action — but it changes no outward state and sends nothing, so it's not
 * gated; plan CHANGES are proposed in the UI, never auto-applied elsewhere.
 */
const GoalSchema = z.object({
  target: z
    .object({
      archetype: z.string().max(120).optional(),
      seniority: z.string().max(60).optional(),
      comp_floor: z.number().int().nonnegative().max(10_000_000).optional(),
      company_type: z.string().max(80).optional(),
      location: z.string().max(120).optional(),
      remote: z.boolean().optional(),
      domains: z.array(z.string().max(60)).max(20).optional(),
    })
    .default({}),
  deadline_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "use yyyy-mm-dd")
    .nullable()
    .optional(),
  deadline_hard: z.boolean().optional(),
  constraints: z
    .object({
      visa: z.string().max(120).optional(),
      dealbreakers: z.array(z.string().max(120)).max(20).optional(),
      must_haves: z.array(z.string().max(120)).max(20).optional(),
    })
    .nullable()
    .optional(),
  intensity: z
    .object({
      hours_per_week: z.number().int().min(0).max(168).optional(),
      apps_per_week_ceiling: z.number().int().min(0).max(200).optional(),
    })
    .nullable()
    .optional(),
  also_open_to: z.record(z.string(), z.unknown()).nullable().optional(),
  // W7 multi-goal-lite: keep the current active goal as a paused alternate and
  // create this as the new active goal, instead of editing in place.
  save_as_new: z.boolean().optional(),
});

const SwitchSchema = z.object({
  goalId: z.string().uuid(),
  action: z.enum(["activate", "pause", "archive"]),
});

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, GoalSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // Upsert the single active goal (unique partial index enforces one per user).
  const { data: existing } = await supabase
    .from("goals")
    .select("id")
    .eq("status", "active")
    .maybeSingle<{ id: string }>();

  const row = {
    user_id: user.id,
    target: input.target,
    deadline_date: input.deadline_date ?? null,
    deadline_hard: input.deadline_hard ?? false,
    constraints: input.constraints ?? null,
    intensity: input.intensity ?? null,
    also_open_to: input.also_open_to ?? null,
    status: "active",
    updated_at: new Date().toISOString(),
  };

  let goalId = existing?.id ?? null;
  if (goalId && input.save_as_new) {
    // W7: park the current active goal as an alternate, then insert the new one.
    const { error: pauseErr } = await supabase
      .from("goals")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", goalId);
    if (pauseErr) return NextResponse.json({ error: "save failed" }, { status: 500 });
    goalId = null;
  }
  if (goalId) {
    const { error } = await supabase.from("goals").update(row).eq("id", goalId);
    if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });
  } else {
    const { data: ins, error } = await supabase
      .from("goals")
      .insert(row)
      .select("id")
      .single<{ id: string }>();
    if (error || !ins) return NextResponse.json({ error: "save failed" }, { status: 500 });
    goalId = ins.id;
  }

  // Recompute + cache the plan on the row.
  const { data: goal } = await supabase.from("goals").select("*").eq("id", goalId).single<GoalRow>();
  if (!goal) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [supply, rates] = await Promise.all([liveSupply(supabase), ratesFromTracker(supabase)]);
  const plan = planFor(goal, supply, rates, todayISO());
  await supabase
    .from("goals")
    .update({ plan, computed_at: new Date().toISOString() })
    .eq("id", goalId);

  // Append-only signal: the user set/changed their goal.
  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "goal",
    subject_ref: goalId,
    action: "edit",
    payload: { deadline: goal.deadline_date, archetype: goal.target?.archetype ?? null },
    weight: 3,
  });

  return NextResponse.json({ ok: true, goal: { ...goal, plan }, plan });
}

/**
 * W7 — goal switching. Activate a paused/archived goal (parking the current
 * active one), or pause/archive any goal. Activation recomputes the plan so
 * the feed/pace re-aim immediately; sourcing re-aims on the next rematch.
 */
export async function PATCH(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(req, SwitchSchema);
  if (!parsed.ok) return parsed.response;
  const { goalId, action } = parsed.data;

  const { data: target } = await supabase.from("goals").select("*").eq("id", goalId).maybeSingle<GoalRow>();
  if (!target) return NextResponse.json({ error: "no such goal" }, { status: 404 });

  const now = new Date().toISOString();

  if (action === "activate") {
    if (target.status !== "active") {
      // Park the current active first (the partial-unique index allows one).
      const { error: parkErr } = await supabase
        .from("goals")
        .update({ status: "paused", updated_at: now })
        .eq("status", "active");
      if (parkErr) return NextResponse.json({ error: "switch failed" }, { status: 500 });
      const { error: actErr } = await supabase
        .from("goals")
        .update({ status: "active", updated_at: now })
        .eq("id", goalId);
      if (actErr) return NextResponse.json({ error: "switch failed" }, { status: 500 });
    }
    // Fresh plan for the newly active goal.
    const [supply, rates] = await Promise.all([liveSupply(supabase), ratesFromTracker(supabase)]);
    const plan = planFor(target, supply, rates, todayISO());
    await supabase.from("goals").update({ plan, computed_at: now }).eq("id", goalId);

    await supabase.from("decision_events").insert({
      user_id: user.id,
      kind: "goal",
      subject_ref: goalId,
      action: "approve",
      payload: { switch: "activate", archetype: target.target?.archetype ?? null },
      weight: 3,
    });
    return NextResponse.json({ ok: true, goalId, status: "active", plan });
  }

  const status = action === "pause" ? "paused" : "archived";
  const { error } = await supabase.from("goals").update({ status, updated_at: now }).eq("id", goalId);
  if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });

  await supabase.from("decision_events").insert({
    user_id: user.id,
    kind: "goal",
    subject_ref: goalId,
    action: action === "archive" ? "reject" : "edit",
    payload: { switch: action },
    weight: 1,
  });
  return NextResponse.json({ ok: true, goalId, status });
}
