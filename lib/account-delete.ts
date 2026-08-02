/**
 * Account data deletion, the code behind the "Delete everything" control in
 * `app/(app)/settings/page.tsx` and `app/api/account/delete/route.ts`.
 *
 * WHY A SERVICE-ROLE DELETE, WHEN RLS EXISTS. The user-facing RLS policies do
 * not grant DELETE on most of these tables: `db/migrations/0002_rls.sql` gives
 * owners select/insert/update only, and `decision_events` is deliberately
 * append-only (no update, no delete policy at all). So a browser client cannot
 * erase its own rows even though it owns them. The route therefore:
 *   1. identifies the user from their session cookie (RLS-bound client), then
 *   2. deletes with the service-role client, filtered `.eq("user_id", userId)`
 *      on every single statement.
 * The authorization decision is still "who does the session say you are", the
 * service role only widens what may be deleted, never whose rows. `userId` is
 * never taken from the request body; passing one in is not possible.
 *
 * This module is pure enough to unit-test: it takes a minimal client shape, so
 * the tests drive it with a fake and assert the filters that actually ran.
 */

/** The narrow slice of the Supabase client this module uses. */
export interface DeleteFilter {
  eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
}
export interface DeleteTable {
  delete(): DeleteFilter;
}
export interface DeleteClient {
  from(table: string): DeleteTable;
}

/**
 * Every table that holds rows belonging to one user, in the order they are
 * purged. Order is cosmetic: nothing here has a foreign key onto anything else
 * here that would block a delete (the only intra-user reference,
 * `ro_memory.superseded_by`, is ON DELETE SET NULL).
 *
 * Keep this list in step with `db/migrations/`, a new user-owned table that is
 * not listed here is a table the delete control silently misses. The invariant
 * test in `tests/unit/account-delete.test.ts` pins the list so adding a table
 * without deciding about deletion fails CI.
 */
export const USER_DATA_TABLES: readonly string[] = [
  "master_profile", // the CV text, the canonical profile, the LinkedIn URL
  "profile_embeddings", // the vector derived from that profile text
  "matches", // RO's per-role reasoning about this person
  "artifacts", // résumés, cover letters, screening answers, counters
  "applications", // the tracker: where they applied and what happened
  "pipeline", // stage, messages, interview rounds, debriefs
  "goals",
  "intents",
  "role_notes",
  "connections", // people from THEIR LinkedIn export: names, employers, emails
  "ro_memory", // what RO has written down about them
  "ro_threads", // verbatim recent question/answer turns
  "taste_model",
  "taste_dimensions",
  "decision_events", // the append-only behaviour log
  "notifications",
  "google_tokens", // Gmail/Calendar refresh token, if they connected Google
  "profiles", // settings row; deleted last, it is what `is_admin()` reads
] as const;

/**
 * What deletion does NOT cover. Stated here, in code, next to what it does
 * cover, so the two cannot drift apart, `docs/PRIVACY.md` and the settings
 * copy both describe exactly this list.
 */
export const NOT_COVERED_BY_DELETE: readonly string[] = [
  "agent_runs: the cost/latency row for each model call. `user_id` is set to NULL when the auth account goes (ON DELETE SET NULL in db/migrations/0001_init.sql), leaving an unattributed billing record. It never contained CV text.",
  "rate_events and index_ask_events: abuse counters keyed by IP address, not by user id, so they cannot be matched back to an account from application code. They age out on the retention window in lib/retention.ts.",
  "Third-party copies: anything Anthropic, Supabase, Cloudflare, or the optional LinkedIn scraper hold under their own retention. This button reaches the RoleOS database only.",
  "Backups: whatever the Supabase project's own point-in-time recovery holds until it rolls off. Not reachable from application code.",
] as const;

export interface DeleteOutcome {
  /** Tables the delete ran against successfully. */
  deleted: string[];
  /** Tables that errored, with the message. Deletion continues past a failure. */
  failed: { table: string; error: string }[];
}

/**
 * Delete every row this user owns, table by table, each filtered on their id.
 *
 * Idempotent: a delete of rows that are already gone is a no-op success in
 * Postgres, so calling this twice returns the same shape and touches nothing
 * the second time. A per-table failure is collected rather than thrown, so one
 * bad table cannot leave the other seventeen behind.
 */
export async function deleteUserData(db: DeleteClient, userId: string): Promise<DeleteOutcome> {
  if (!userId) throw new Error("deleteUserData: userId is required");
  const out: DeleteOutcome = { deleted: [], failed: [] };
  for (const table of USER_DATA_TABLES) {
    // `profiles` is keyed by `id`, every other table by `user_id`.
    const column = table === "profiles" ? "id" : "user_id";
    try {
      const { error } = await db.from(table).delete().eq(column, userId);
      if (error) out.failed.push({ table, error: error.message });
      else out.deleted.push(table);
    } catch (e) {
      out.failed.push({ table, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
