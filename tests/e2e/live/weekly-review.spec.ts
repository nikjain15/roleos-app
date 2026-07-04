import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { admin, seedApplication, seedGoal, seedMatch, someRoleIds } from "./seed";

/**
 * X7 — weekly strategy review, live. The thin-signal short-circuit, storage
 * rendering, and guards are model-free; the real review run is model-gated.
 */
test.describe("weekly review (model-free paths)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("unauth 401 on GET and POST", async ({ request }) => {
    expect((await request.get("/api/review")).status()).toBe(401);
    expect((await request.post("/api/review")).status()).toBe(401);
  });

  test("brand-new user gets the honest not-enough-signal answer — no model spend", async ({ request, newUser }) => {
    const u = await newUser("x7-thin");
    const res = await request.post("/api/review", { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { review: unknown; message?: string };
    expect(j.review).toBeNull();
    expect(j.message).toContain("Not enough signal");
  });

  test("429 once the hourly window is seeded full", async ({ request, newUser }) => {
    const u = await newUser("x7-rate");
    await admin().from("rate_events").insert(Array.from({ length: 2 }, () => ({ scope: "weekly_review", subject: u.userId })));
    expect((await request.post("/api/review", { headers: { cookie: u.cookie } })).status()).toBe(429);
  });

  test("a stored review renders on /review from the notification (free)", async ({ browser, newUser }) => {
    const u = await newUser("x7-render");
    await u.db.from("notifications").insert({
      user_id: u.userId,
      kind: "weekly_review",
      tier: "in_feed",
      title: "A STEADY, HONEST WEEK",
      body: "4 of 5 planned sends.",
      payload: {
        headline: "A STEADY, HONEST WEEK",
        pace_read: "4 of 5 planned sends — close to plan.",
        working: ["Screens are landing from fintech roles"],
        not_working: ["Generic summaries on non-fintech sends"],
        pivots: [{ change: "Bias the week to fintech pursues", why: "2 of 2 screens came from them" }],
        next_week: ["Send the 2 ready drafts", "Dismiss the stale maybes"],
        wellbeing_note: "Solid week — take the evening.",
      },
      status: "unread",
    });

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto("/review");
    await expect(page.getByText("A STEADY, HONEST WEEK")).toBeVisible();
    await expect(page.getByText("Bias the week to fintech pursues")).toBeVisible();
    await expect(page.getByText("take the evening", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run a fresh review" })).toBeVisible();
    await context.close();
  });
});

test.describe("weekly review (model-gated)", () => {
  test.skip(!hasSecrets || !process.env.E2E_LIVE_MODEL, "needs .env.local + E2E_LIVE_MODEL=1 (spends model calls)");

  test("a week of real activity produces a grounded, persisted review", async ({ request, newUser }) => {
    const u = await newUser("x7-run");
    const roles = await someRoleIds(u.db, 3);
    const gid = await seedGoal(u.db, u.userId, { deadline_date: "2026-10-01" });
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 85);
    await seedMatch(u.db, u.userId, roles[1].id, "pursue", 80);
    await seedApplication(u.db, u.userId, roles[0].id, gid, "applied");
    await seedApplication(u.db, u.userId, roles[1].id, gid, "screening");
    // Curation signal this week.
    await u.db.from("decision_events").insert([
      { user_id: u.userId, kind: "match", subject_ref: roles[2].id, action: "skip", payload: {}, weight: 2 },
      { user_id: u.userId, kind: "match", subject_ref: roles[0].id, action: "approve", payload: {}, weight: 3 },
    ]);

    const res = await request.post("/api/review", { headers: { cookie: u.cookie }, timeout: 120_000 });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { review: { headline: string; next_week: string[] } | null };
    expect(j.review).not.toBeNull();
    expect(j.review!.headline.length).toBeGreaterThan(5);
    expect(j.review!.next_week.length).toBeGreaterThan(0);

    const { data: stored } = await u.db.from("notifications").select("kind, payload").eq("kind", "weekly_review");
    expect(stored!.length).toBe(1);
  });
});
