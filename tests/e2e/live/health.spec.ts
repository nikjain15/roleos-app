import { test, expect, hasSecrets } from "./fixtures";

/**
 * Slice H1 — /api/health, live. Public, cheap, secret-free; 200 when the DB
 * answers. Also asserts the response leaks nothing beyond booleans/timestamps.
 */
test.describe("health check (H1)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("GET /api/health → 200 {ok:true, checks.db:'ok'} with no data leakage", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { ok: boolean; checks: { db: string }; time: string };
    expect(j.ok).toBe(true);
    expect(j.checks.db).toBe("ok");
    // Nothing beyond the documented shape — no counts, keys, or config.
    expect(Object.keys(j).sort()).toEqual(["checks", "ok", "time"]);
    expect(Object.keys(j.checks)).toEqual(["db"]);
  });

  test("health is anonymous — works with no session and is safe to probe", async ({ request }) => {
    // Same call, explicitly cookie-free; also confirm POST isn't a surface.
    const res = await request.get("/api/health", { headers: {} });
    expect(res.status()).toBe(200);
    expect((await request.post("/api/health")).status()).toBe(405);
  });
});
