import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { validateBody } from "@/lib/validate";
import { assembleContext, toRoAskState } from "@/lib/ro/context";
import { syncMemory } from "@/lib/ro/memory";
import { loadThread, saveTurn, toConversation, summarizePrompt } from "@/lib/ro/thread";
import { callModel, type AgentRunRecord } from "@/agent/registry";
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
  // M1b: bring the notebook up to date from the user's actions before we recall.
  // FAIL-SAFE + idempotent — before the ro_memory migration is applied (or on any
  // error) this is a no-op and the dock behaves exactly as M0.
  try {
    await syncMemory(supabase, user.id);
  } catch (err) {
    logError("ro_memory.sync_failed", err);
  }

  // M3 follow-up: when the dock is asked from an artifact surface (the résumé
  // editor / cover studio — where the command bar's tune notes are scoped
  // `artifact:<id>`), recall with that scope so those notes outrank globals.
  const artifactMatch = screen?.match(/^\/studio\/(?:resume|cover)\/([0-9a-f-]{36})/i);
  const recallScope = artifactMatch ? `artifact:${artifactMatch[1]}` : undefined;

  const ctx = await assembleContext(supabase, user.id, { recallQuery: question, recallScope });
  // M2: the dock's rolling conversation thread (fail-safe: empty before migration).
  const thread = await loadThread(supabase, user.id, "dock").catch(() => ({ surface: "dock", summary: "", turns: [] }));
  const state = { ...toRoAskState(ctx), conversation: toConversation(thread) };

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

    // M2: record this turn in the rolling thread (fail-safe; the summary fold runs
    // on the cheap tier only when turns overflow, and is metered).
    try {
      const runs = await saveTurn(supabase, user.id, "dock", { q: question, a: answer }, thread, async (prev, overflow) => {
        const { system, prompt } = summarizePrompt(prev, overflow);
        const { text, run } = await callModel("quick_tag", { system, prompt }, { skill: "ro_thread_summary" });
        return { text, run };
      });
      if (runs.length) await logAgentRuns(user.id, runs as AgentRunRecord[], { skill: "ro_thread_summary" });
    } catch (err) {
      logError("ro_thread.save_failed", err);
    }

    return NextResponse.json({ answer, action: act ? null : action, act, grounded: verdict.status });
  } catch (err) {
    logError("ro_ask.failed", err, { screen });
    return NextResponse.json({ error: "RO couldn't answer that one — try again." }, { status: 500 });
  }
}
