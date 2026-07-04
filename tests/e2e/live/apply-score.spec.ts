import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { admin, seedArtifact, seedMasterProfile, seedMatch, someRoleIds } from "./seed";

/**
 * X3 — pre-send quality score, live. Guard paths (auth/validation/ownership/
 * approval/rate limit) are model-free; the actual scoring is model-gated.
 */
test.describe("apply-score guards (model-free)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("401 unauth · 400 junk · 404 foreign · 409 unapproved — all without model spend", async ({ request, newUser }) => {
    expect((await request.post("/api/apply-score", { data: { artifactId: "00000000-0000-0000-0000-000000000000" } })).status()).toBe(401);

    const u = await newUser("x3-guards");
    const H = { cookie: u.cookie };
    expect((await request.post("/api/apply-score", { headers: H, data: { artifactId: "junk" } })).status()).toBe(400);

    const B = await newUser("x3-foreign");
    const roles = await someRoleIds(u.db, 1);
    const foreign = await seedArtifact(B.db, B.userId, roles[0].id, { status: "approved" });
    expect((await request.post("/api/apply-score", { headers: H, data: { artifactId: foreign } })).status()).toBe(404);

    const draft = await seedArtifact(u.db, u.userId, roles[0].id, { status: "draft" });
    expect((await request.post("/api/apply-score", { headers: H, data: { artifactId: draft } })).status()).toBe(409);
  });

  test("429 once the hourly window is seeded full — before any model call", async ({ request, newUser }) => {
    const u = await newUser("x3-rate");
    const roles = await someRoleIds(u.db, 1);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    await admin().from("rate_events").insert(Array.from({ length: 8 }, () => ({ scope: "apply_score", subject: u.userId })));
    const res = await request.post("/api/apply-score", { headers: { cookie: u.cookie }, data: { artifactId: art } });
    expect(res.status()).toBe(429);
  });

  test("a stored score renders on the Apply page from provenance (no model call)", async ({ browser, newUser }) => {
    const u = await newUser("x3-render");
    const roles = await someRoleIds(u.db, 1);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    await u.db
      .from("artifacts")
      .update({
        provenance: {
          app_score: {
            score: 72,
            screen_likelihood: "medium",
            strengths: ["Payments depth reads clearly"],
            weak_spots: [{ issue: "No metric on the platform bullet", fix: "Add the request-volume number" }],
            note: "Solid but one fix away from strong.",
          },
        },
      })
      .eq("id", art);

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto(`/apply/${art}`);
    await expect(page.getByText("72", { exact: true })).toBeVisible();
    await expect(page.getByText("medium screen likelihood")).toBeVisible();
    await expect(page.getByText(/No metric on the platform bullet/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Re-score" })).toBeVisible();
    await context.close();
  });
});

test.describe("apply-score scoring (model-gated)", () => {
  test.skip(!hasSecrets || !process.env.E2E_LIVE_MODEL, "needs .env.local + E2E_LIVE_MODEL=1 (spends model calls)");

  test("scores an approved résumé and persists score + calibration event", async ({ request, newUser }) => {
    const u = await newUser("x3-score");
    const roles = await someRoleIds(u.db, 1);
    await seedMasterProfile(u.db, u.userId, "Senior PM, 9 years across payments and AI platforms; led 5 PMs.");
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 82);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });

    const res = await request.post("/api/apply-score", {
      headers: { cookie: u.cookie },
      data: { artifactId: art },
      timeout: 120_000,
    });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { app_score: { score: number; screen_likelihood: string } };
    expect(j.app_score.score).toBeGreaterThanOrEqual(0);
    expect(j.app_score.score).toBeLessThanOrEqual(100);
    expect(["low", "medium", "high"]).toContain(j.app_score.screen_likelihood);

    const { data: after } = await u.db.from("artifacts").select("provenance").eq("id", art).single();
    expect((after!.provenance as { app_score?: { score: number } }).app_score?.score).toBe(j.app_score.score);
    const { data: ev } = await u.db.from("decision_events").select("payload").eq("user_id", u.userId).eq("kind", "app_score");
    expect(ev!.length).toBe(1);
    expect((ev![0].payload as { score: number }).score).toBe(j.app_score.score);
  });
});
