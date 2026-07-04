import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Health check (slice H1). Public, cheap, secret-free: proves the Worker is up
 * and the database answers. 200 when healthy, 503 when a dependency is down —
 * the shape uptime monitors and the admin Ops card both read. Exposes NO
 * counts, config, or identifiers beyond ok/degraded booleans.
 */
export async function GET(): Promise<Response> {
  const checks: Record<string, "ok" | "down"> = { db: "down" };
  try {
    const db = supabaseService();
    const { error } = await db.from("roles").select("id", { count: "exact", head: true }).limit(1);
    checks.db = error ? "down" : "ok";
    if (error) logError("health.db", error);
  } catch (err) {
    logError("health.db", err);
  }

  const ok = Object.values(checks).every((c) => c === "ok");
  return NextResponse.json({ ok, checks, time: new Date().toISOString() }, { status: ok ? 200 : 503 });
}
