import { test, expect, hasSecrets } from "./fixtures";

/**
 * X9 — the reply desk. The connected desk needs a live Gmail token + the Google
 * API, so the *assembly* (ranking, slot proposal, the sendable:false invariant)
 * is proven exhaustively in tests/unit/reply-desk.test.ts. Here we assert the
 * request-level states that don't need Google: auth, the honest not-connected
 * state, and that the API never reads threads for the signed-out. The connected
 * shell is a single boolean branch off `hasGoogleConnected` — its inverse (the
 * not-connected state below) plus the unit suite cover it.
 */

test.describe("reply-desk (X9)", () => {
  test.skip(!hasSecrets, "needs .env.local secrets");

  test("signed-out → redirected to login, never the desk", async ({ request }) => {
    const res = await request.get("/reply-desk", { maxRedirects: 0 });
    expect([302, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/login");
  });

  test("not connected → honest 'connect Gmail' state with a way to do it, never a broken page", async ({
    request,
    newUser,
  }) => {
    const u = await newUser("rd-noconn");
    const res = await request.get("/reply-desk", { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Connect Gmail to turn the desk on");
    expect(html).toContain("/settings");
    // The desk mount must NOT render when Gmail isn't connected.
    expect(html).not.toContain("Reading your threads");
  });

  test("API reports connected:false (and zero rows) for a user without Google", async ({
    request,
    newUser,
  }) => {
    const u = await newUser("rd-api-noconn");
    const res = await request.post("/api/reply-desk", { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { connected: boolean; rows: unknown[] };
    expect(body.connected).toBe(false);
    expect(body.rows).toEqual([]);
  });

  test("API requires auth — no thread reads for the signed-out", async ({ request }) => {
    const res = await request.post("/api/reply-desk");
    expect(res.status()).toBe(401);
  });
});
