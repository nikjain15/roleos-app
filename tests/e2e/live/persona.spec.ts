import { test, expect, hasSecrets } from "./fixtures";
import { seedMasterProfile, seedMatch, seedGoal, seedArtifact, seedApplication, someRoleIds } from "./seed";
import { expectNoSeriousA11y } from "../helpers/axe";

/**
 * D2 persona happy-path (senior AI PM) — seed a realistic hunt and drive the authed
 * surfaces end-to-end: feed cockpit, roles workspace, tracker, goal plan. Plus a
 * 375px + axe pass on an authed screen (D5/D7 on a real signed-in page).
 */
test.describe("persona: senior AI PM — the working loop renders on real data", () => {
  test.skip(!hasSecrets, "live suite needs .env.local (service-role) — skipped in CI");

  test("feed / roles / tracker / goal all render the seeded hunt", async ({ page, context, newUser }) => {
    const u = await newUser("persona");
    const roles = await someRoleIds(u.db, 4);
    expect(roles.length).toBeGreaterThan(0);

    await seedMasterProfile(u.db, u.userId, "Senior product manager, 10 years in payments & fraud ML at fintech scale-ups.");
    const goalId = await seedGoal(u.db, u.userId, { deadline_date: futureDate(120), intensity: { apps_per_week_ceiling: 20 } });
    for (const r of roles) await seedMatch(u.db, u.userId, r.id, "pursue", 82);
    const artId = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    await seedApplication(u.db, u.userId, roles[1].id, goalId, "applied");

    await applyCookie(context, u.cookie);

    // Feed cockpit
    await page.goto("/feed");
    await expect(page.locator("body")).toContainText("Today");
    await expect(page.locator("body")).toContainText(/On track|At risk|Off track/);

    // Roles workspace — the pursued role is there
    await page.goto("/roles");
    await expect(page.locator("body")).toContainText(roles[0].company);

    // Tracker — the applied role is in the pipeline
    await page.goto("/tracker");
    await expect(page.locator("body")).toContainText(roles[1].company);

    // Goal plan
    await page.goto("/goal");
    await expect(page.locator("body")).toContainText(/applications|apply/i);

    // Résumé editor opens the approved artifact
    await page.goto(`/studio/resume/${artId}`);
    await expect(page.locator("body")).toContainText(roles[0].company);

    // D5/D7 on an authed screen at mobile width
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/feed");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal overflow on mobile feed").toBeLessThanOrEqual(1);
    await expectNoSeriousA11y(page, "/feed (authed, 375px)");
  });
});

function futureDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function applyCookie(context: import("@playwright/test").BrowserContext, cookie: string) {
  const cookies = cookie.split("; ").map((pair) => {
    const eq = pair.indexOf("=");
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: "127.0.0.1", path: "/", sameSite: "Lax" as const };
  });
  await context.addCookies(cookies);
}
