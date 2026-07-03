import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { someRoleIds } from "./seed";

/**
 * Slice H5 — pagination caps. A heavy user (many matches) still gets a fast,
 * intact board: the pages read bounded sets and never crash or truncate into a
 * broken state. Model-free (bulk-seeded matches).
 */
test.describe("perf caps (H5)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("a user with 60 matches gets an intact roles board and feed", async ({ browser, newUser }) => {
    const u = await newUser("h5-heavy");
    const roles = await someRoleIds(u.db, 60);
    expect(roles.length).toBeGreaterThanOrEqual(50); // corpus sanity

    await u.db.from("matches").insert(
      roles.map((r, i) => ({
        user_id: u.userId,
        role_id: r.id,
        fit_score: 40 + (i % 60),
        reasoning: { why: "seeded" },
        gaps: [],
        recommendation: i % 3 === 0 ? "pursue" : "maybe",
        status: "new",
      })),
    );

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();

    await page.goto("/roles");
    await expect(page.getByText(/\d+ shown/)).toBeVisible();
    const shown = await page.locator("main div.space-y-2 > div").count();
    expect(shown).toBeGreaterThanOrEqual(50); // all 60 fit inside the 500 cap

    await page.goto("/feed");
    await expect(page.getByRole("heading").first()).toBeVisible(); // renders, no crash
    await context.close();
  });
});
