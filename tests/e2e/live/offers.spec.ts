import { test, expect, hasSecrets, applyAuth } from "./fixtures";

/**
 * X5 — offer co-pilot, live. Entirely model-free: benchmark API shape,
 * the client-side comparison, weight-driven flips, and browser-only persistence.
 */
test.describe("offer co-pilot (X5)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("benchmark API: 401 unauth; authed returns honest n + basis; unknown archetype → n=0", async ({ request, newUser }) => {
    expect((await request.get("/api/comp-benchmark")).status()).toBe(401);

    const u = await newUser("x5-bench");
    const res = await request.get("/api/comp-benchmark", { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { n: number; p50: number | null; basis: string };
    expect(j.n).toBeGreaterThan(0); // the corpus has stated ranges (measured 2026-07-03)
    expect(j.p50).toBeGreaterThan(50_000);
    expect(j.basis).toContain("not a market survey");

    const none = await request.get("/api/comp-benchmark?archetype=Nonexistent%20Archetype", { headers: { cookie: u.cookie } });
    const nj = (await none.json()) as { n: number; p50: number | null };
    expect(nj.n).toBe(0);
    expect(nj.p50).toBeNull();
  });

  test("two offers compare client-side; weights flip the leader; offers persist across reload", async ({ browser, newUser }) => {
    const u = await newUser("x5-ui");
    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto("/offers");

    // Add two offers.
    await page.getByRole("button", { name: "+ Add offer" }).click();
    await page.getByRole("button", { name: "+ Add offer" }).click();
    const names = page.getByLabel("Offer name");
    const bases = page.getByLabel("Base ($/yr)");
    await names.nth(0).fill("MoneyCo");
    await bases.nth(0).fill("260000");
    await names.nth(1).fill("GrowthCo");
    await bases.nth(1).fill("200000");
    await expect(page.getByText("The math, shown")).toBeVisible();
    await expect(page.getByText("leads on YOUR weights")).toBeVisible();
    // Equal soft ratings → more money leads.
    const leader = await page.locator("tbody tr").first().textContent();
    expect(leader).toContain("MoneyCo");

    // GrowthCo maxes growth AND the user weights growth over comp → it flips.
    await page.locator('input[type="range"]').nth(3).fill("5"); // 2nd offer's growth rating
    const weightSliders = page.locator('section[aria-label="Your priorities"] input[type="range"]');
    await weightSliders.nth(0).fill("0"); // comp weight
    await weightSliders.nth(1).fill("60"); // growth weight
    const newLeader = await page.locator("tbody tr").first().textContent();
    expect(newLeader).toContain("GrowthCo");

    // Persistence: reload keeps the offers (browser-only).
    await page.reload();
    await expect(page.getByLabel("Offer name").nth(0)).toHaveValue("MoneyCo");

    // Clear wipes storage.
    await page.getByRole("button", { name: /Clear all/ }).click();
    const stored = await page.evaluate(() => window.localStorage.getItem("ro-offers-v1"));
    expect(stored).toBeNull();
    await context.close();
  });
});
