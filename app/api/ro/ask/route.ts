import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { assembleContext, toRoAskState } from "@/lib/ro/context";
import { runSkill } from "@/agent/skills/run";
import roAsk from "@/agent/skills/ro_ask";
import { logAgentRuns } from "@/lib/agent-runs";
import { parseModelJson } from "@/lib/json";
import { validateAct, type RawAct } from "@/lib/dock-acts";
import { logError } from "@/lib/log";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * RO-everywhere dock ask/act layer (buildplan §3). Answers a question grounded in
 * the user's OWN state (goal + pipeline counts + screen), via the metered registry.
 * RLS-scoped; zod-validated. Actions are proposed, never executed — the route
 * returns an in-app link the user clicks (human-gated-outward: this imports no send
 * tool, and the suggested href is whitelisted server-side).
 */
const BodySchema = z.object({
  question: z.string().min(2).max(500),
  screen: z.string().max(80).optional(),
});

const ALLOWED_HREFS = new Set([
  "/feed", "/goal", "/roles", "/tracker", "/studio/coach", "/studio/build", "/watch",
]);

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // H3: per-user budget on the dock's model calls.
  const rate = await checkRateLimit("ro_ask", user.id);
  if (!rate.allowed) return rateLimitResponse("You've asked RO a lot this hour — it resets soon.");

  const parsed = await validateBody(req, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { question, screen } = parsed.data;

  // One RLS-scoped read of the user's working context (M0). Unlike before, this
  // now includes their PROFILE — so RO on the dock grounds on who they are, not
  // just their pipeline. top_pursue stays the only roles a tailor act may name.
  const ctx = await assembleContext(supabase, user.id);
  const state = toRoAskState(ctx);

  try {
    const { verdict } = await runSkill(roAsk, {
      userId: user.id,
      data: { question, screen: screen ?? "unknown", state },
    });
    await logAgentRuns(user.id, verdict.runs, { skill: roAsk.id });

    const out = parseModelJson<{
      answer?: string;
      action?: { label?: string; href?: string } | null;
      act?: RawAct | null;
    }>(verdict.finalOutput);
    const answer = out?.answer ?? verdict.finalOutput;
    // Whitelist the suggested action href (defense-in-depth: never a foreign link).
    const action =
      out?.action && out.action.href && ALLOWED_HREFS.has(out.action.href) && out.action.label
        ? { label: String(out.action.label).slice(0, 40), href: out.action.href }
        : null;
    // W3 act-verbs: validate everything the model proposed. A tailor act may only
    // name one of the user's OWN top-pursue roles; filter params are sanitized to
    // a whitelisted /roles?… href. Executing either still takes a USER click.
    const act = validateAct(out?.act, ctx.topPursue);

    return NextResponse.json({ answer, action: act ? null : action, act, grounded: verdict.status });
  } catch (err) {
    logError("ro_ask.failed", err, { screen });
    return NextResponse.json({ error: "RO couldn't answer that one — try again." }, { status: 500 });
  }
}
