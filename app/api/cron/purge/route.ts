import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { purgePlan } from "@/lib/retention";
import { logInfo, logWarn } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Retention purge, the job that makes the windows in `lib/retention.ts` real.
 *
 * Called nightly by the dedicated cron worker (`cron/worker.ts`, the 02:30 UTC
 * trigger) with the shared secret, exactly like the other /api/cron routes.
 * Service-role, because these tables have no user-facing delete path (and two
 * of them, the IP counters, have no user column at all).
 *
 * The windows themselves live in `lib/retention.ts` and are rendered from the
 * same constants in `/privacy`, so the notice cannot promise a window this job
 * does not delete on.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = env().CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = supabaseService();
  const results: { table: string; cutoff: string; ok: boolean; error?: string }[] = [];

  for (const { rule, cutoff } of purgePlan()) {
    let q = db.from(rule.table).delete().lt(rule.column, cutoff);
    if (rule.onlyStatusIn) q = q.in(rule.onlyStatusIn.column, rule.onlyStatusIn.values);
    const { error } = await q;
    if (error) {
      logWarn("retention.purge.failed", { table: rule.table, error: error.message });
      results.push({ table: rule.table, cutoff, ok: false, error: error.message });
    } else {
      results.push({ table: rule.table, cutoff, ok: true });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  logInfo("retention.purge", { tables: results.length, failed });
  return NextResponse.json({ ok: failed === 0, results }, { status: failed === 0 ? 200 : 500 });
}
