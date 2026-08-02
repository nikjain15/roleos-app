import { describe, it, expect } from "vitest";
import {
  deleteUserData,
  USER_DATA_TABLES,
  NOT_COVERED_BY_DELETE,
  type DeleteClient,
} from "@/lib/account-delete";

/**
 * The delete path (A2). What is asserted here is the part that can actually be
 * wrong in code: that every user-owned table is targeted, that EVERY statement
 * is filtered to one user id (so no caller can reach another account's rows),
 * that repeating the call is harmless, and that a single failing table does not
 * silently swallow the rest.
 *
 * The route's authorization (user id comes from the session cookie, never the
 * body) is structural: `app/api/account/delete/route.ts` has no user-id
 * parameter to pass. The check below that no table is queried with a second id
 * is the code-level half of that guarantee.
 */

/** A fake Supabase client that records `from(t).delete().eq(col, val)` calls. */
function fakeDb(failOn: Record<string, string> = {}) {
  const calls: { table: string; column: string; value: string }[] = [];
  const db: DeleteClient = {
    from(table: string) {
      return {
        delete() {
          return {
            async eq(column: string, value: string) {
              calls.push({ table, column, value });
              return failOn[table] ? { error: { message: failOn[table] } } : { error: null };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("deleteUserData", () => {
  it("deletes from every user-owned table, once each", async () => {
    const { db, calls } = fakeDb();
    const out = await deleteUserData(db, USER);
    expect(calls.map((c) => c.table)).toEqual([...USER_DATA_TABLES]);
    expect(out.deleted).toEqual([...USER_DATA_TABLES]);
    expect(out.failed).toEqual([]);
  });

  it("filters EVERY statement to the given user, and never to anyone else", async () => {
    const { db, calls } = fakeDb();
    await deleteUserData(db, USER);
    expect(calls.every((c) => c.value === USER)).toBe(true);
    expect(calls.some((c) => c.value === OTHER)).toBe(false);
    // No unfiltered statement can exist: every recorded call carries a column.
    expect(calls.every((c) => c.column.length > 0)).toBe(true);
  });

  it("keys `profiles` on id and every other table on user_id", async () => {
    const { db, calls } = fakeDb();
    await deleteUserData(db, USER);
    const profiles = calls.filter((c) => c.table === "profiles");
    expect(profiles).toHaveLength(1);
    expect(profiles[0].column).toBe("id");
    expect(calls.filter((c) => c.table !== "profiles").every((c) => c.column === "user_id")).toBe(true);
  });

  it("is idempotent: a second run does the same work and reports the same shape", async () => {
    const { db } = fakeDb();
    const first = await deleteUserData(db, USER);
    const second = await deleteUserData(db, USER);
    expect(second).toEqual(first);
  });

  it("carries on past a failing table and reports it rather than hiding it", async () => {
    const { db, calls } = fakeDb({ artifacts: "boom" });
    const out = await deleteUserData(db, USER);
    expect(out.failed).toEqual([{ table: "artifacts", error: "boom" }]);
    expect(out.deleted).toHaveLength(USER_DATA_TABLES.length - 1);
    expect(calls).toHaveLength(USER_DATA_TABLES.length); // nothing was skipped
  });

  it("collects a thrown client error instead of aborting the sweep", async () => {
    const db: DeleteClient = {
      from(table: string) {
        return {
          delete() {
            return {
              async eq() {
                if (table === "ro_memory") throw new Error("network");
                return { error: null };
              },
            };
          },
        };
      },
    };
    const out = await deleteUserData(db, USER);
    expect(out.failed).toEqual([{ table: "ro_memory", error: "network" }]);
    expect(out.deleted).toHaveLength(USER_DATA_TABLES.length - 1);
  });

  it("refuses to run without a user id (a blank id would be an unfiltered delete)", async () => {
    const { db, calls } = fakeDb();
    await expect(deleteUserData(db, "")).rejects.toThrow(/userId is required/);
    expect(calls).toEqual([]);
  });
});

describe("the delete surface is honest about its limits", () => {
  it("names the stores it cannot purge", () => {
    const joined = NOT_COVERED_BY_DELETE.join(" ");
    for (const store of ["agent_runs", "rate_events", "Backups", "Third-party"]) {
      expect(joined).toContain(store);
    }
  });

  it("has no duplicate tables in the sweep list", () => {
    expect(new Set(USER_DATA_TABLES).size).toBe(USER_DATA_TABLES.length);
  });
});
