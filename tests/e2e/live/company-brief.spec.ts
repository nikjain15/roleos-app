import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { admin, seedArtifact, someRoleIds } from "./seed";

/**
 * X2 — company briefs, live. Guards and stored-render are model-free; the
 * real brief generation is model-gated.
 */
test.describe("company brief guards (model-free)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("401 unauth · 400 junk · 404 unknown role · 429 seeded window", async ({ request, newUser }) => {
    expect((await request.post("/api/brief", { data: { roleId: "00000000-0000-0000-0000-000000000000" } })).status()).toBe(401);

    const u = await newUser("x2-guards");
    const H = { cookie: u.cookie };
    expect((await request.post("/api/brief", { headers: H, data: { roleId: "junk" } })).status()).toBe(400);
    expect(
      (await request.post("/api/brief", { headers: H, data: { roleId: "00000000-0000-0000-0000-000000000000" } })).status(),
    ).toBe(404);

    await admin().from("rate_events").insert(Array.from({ length: 6 }, () => ({ scope: "company_brief", subject: u.userId })));
    const roles = await someRoleIds(u.db, 1);
    expect((await request.post("/api/brief", { headers: H, data: { roleId: roles[0].id } })).status()).toBe(429);
  });

  test("a stored brief renders on the Apply page for that company (free)", async ({ browser, newUser }) => {
    const u = await newUser("x2-render");
    const roles = await someRoleIds(u.db, 1);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    await u.db.from("notifications").insert({
      user_id: u.userId,
      kind: "company_brief",
      tier: "in_feed",
      title: `Brief · ${roles[0].company}`,
      body: "overview",
      payload: {
        company: roles[0].company,
        overview: "THE STORED COMPANY OVERVIEW.",
        hiring_signal: "Scaling product.",
        what_they_value: ["ownership"],
        comp_read: "Comp not stated in their postings.",
        prep_pointers: ["Know their must-haves cold"],
        unknowns: ["Funding stage — not in my data"],
      },
      status: "read",
    });

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto(`/apply/${art}`);
    await expect(page.getByText("THE STORED COMPANY OVERVIEW.")).toBeVisible();
    await expect(page.getByText(/Funding stage — not in my data/)).toBeVisible(); // honest unknowns render
    await expect(page.getByRole("button", { name: "Refresh brief" })).toBeVisible();
    await context.close();
  });
});

test.describe("company brief generation (model-gated)", () => {
  test.skip(!hasSecrets || !process.env.E2E_LIVE_MODEL, "needs .env.local + E2E_LIVE_MODEL=1 (spends model calls)");

  test("generates a grounded brief with non-empty unknowns and persists it", async ({ request, newUser }) => {
    const u = await newUser("x2-gen");
    const roles = await someRoleIds(u.db, 1);
    const res = await request.post("/api/brief", {
      headers: { cookie: u.cookie },
      data: { roleId: roles[0].id },
      timeout: 120_000,
    });
    expect(res.status()).toBe(200);
    const { brief } = (await res.json()) as { brief: { overview: string; unknowns: string[]; company: string } };
    expect(brief.overview.length).toBeGreaterThan(20);
    expect(brief.unknowns.length).toBeGreaterThan(0); // v1 always has honest unknowns
    expect(brief.company).toBe(roles[0].company);

    const { data: stored } = await u.db.from("notifications").select("kind").eq("user_id", u.userId).eq("kind", "company_brief");
    expect(stored!.length).toBe(1);
  });
});
