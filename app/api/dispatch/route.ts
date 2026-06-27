import { NextResponse } from "next/server";

/**
 * THE ONLY outbound path (architecture.md §6, layer 2). A human clicks "Send it"
 * in the UI; that gesture POSTs here. This route — and ONLY this route — performs
 * an external send. It is a different module from the agent layer; the agent
 * layer cannot import it (enforced by .dependency-cruiser.cjs + tests).
 *
 * Required before anything leaves the building (wired in Phase 3):
 *   1. an authenticated user (Supabase session)
 *   2. a decision_events row of action='send' written in THIS request from a
 *      genuine UI gesture
 *   3. the artifact in status='approved'
 *   4. the actual transport call (email/ATS) — added with the real provider
 *
 * Phase-1 scaffold: returns 501 so the contract exists without a live transport.
 */
export async function POST(_req: Request): Promise<Response> {
  return NextResponse.json(
    { error: "dispatch not yet implemented (Phase 3)" },
    { status: 501 },
  );
}
