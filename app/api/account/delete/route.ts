import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";
import { deleteUserData, type DeleteClient } from "@/lib/account-delete";
import { logError, logInfo } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Delete everything RoleOS stores about the signed-in user.
 *
 * Whose data: taken from the session cookie via the RLS-bound client, never
 * from the request body. There is no `user_id` parameter, so there is nothing
 * to tamper with, a signed-in user can only ever delete themselves, and a
 * signed-out request gets a 401 before any client is constructed.
 *
 * Why the service role does the writing: the user-facing RLS policies grant no
 * DELETE on most user-owned tables, and `decision_events` is append-only on
 * purpose (db/migrations/0002_rls.sql). See lib/account-delete.ts for the full
 * reasoning. Every statement is filtered on the id we just authenticated.
 *
 * What it does not reach is listed in `NOT_COVERED_BY_DELETE` and repeated
 * verbatim in `docs/PRIVACY.md` and in the settings copy.
 */
export async function POST(req: Request): Promise<Response> {
  // Same-origin guard: this is the most destructive endpoint in the app and it
  // is cookie-authenticated. A JSON POST already requires a CORS preflight, so
  // this is belt-and-braces, not the only protection.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "cross-origin request refused" }, { status: 403 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // Typed confirmation, so a stray fetch or a mis-click cannot wipe an account.
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== "DELETE") {
    return NextResponse.json({ error: "confirmation required" }, { status: 400 });
  }

  const db = supabaseService();
  const outcome = await deleteUserData(db as unknown as DeleteClient, user.id);

  // Remove the auth record itself (the email address and the sign-in identity).
  // Best-effort and reported honestly: if it fails, the data rows are still
  // gone and the response says the login record survived, rather than claiming
  // a clean sweep that did not happen.
  let authDeleted = false;
  try {
    const { error } = await db.auth.admin.deleteUser(user.id);
    authDeleted = !error;
    if (error) outcome.failed.push({ table: "auth.users", error: error.message });
  } catch (e) {
    logError("account.delete.auth_failed", e, { user_id: user.id });
    outcome.failed.push({ table: "auth.users", error: e instanceof Error ? e.message : String(e) });
  }

  // End the session either way, the rows behind it no longer exist.
  await supabase.auth.signOut().catch(() => {});

  logInfo("account.delete", {
    tables_deleted: outcome.deleted.length,
    tables_failed: outcome.failed.length,
    auth_deleted: authDeleted,
  });

  // A partial delete is a 207-shaped situation; report it as one rather than as
  // a success. The UI tells the user plainly and points them at a human.
  const ok = outcome.failed.length === 0;
  return NextResponse.json(
    { ok, deleted: outcome.deleted, failed: outcome.failed, auth_deleted: authDeleted },
    { status: ok ? 200 : 500 },
  );
}
