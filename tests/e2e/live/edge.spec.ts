import { test, expect, hasSecrets } from "./fixtures";
import { seedGoal, seedArtifact, someRoleIds } from "./seed";

/**
 * D3 edge / negative states (live) — each must degrade HONESTLY: an empty pipeline,
 * an aggressive deadline, and a flagged résumé all render a truthful state with a
 * way forward, never a crash or a fabricated success.
 */
test.describe("edge states degrade honestly", () => {
  test.skip(!hasSecrets, "live suite needs .env.local (service-role) — skipped in CI");

  test("no matches → honest empty state, not a spinner or a fake list", async ({ page, context, newUser }) => {
    const u = await newUser("edge-empty");
    await applyCookie(context, u.cookie);
    await page.goto("/roles");
    await expect(page.locator("body")).toContainText(/No matches yet|Show RO your background/i);
  });

  test("deadline shorter than one interview cycle → Off track + extend lever", async ({ page, context, newUser }) => {
    const u = await newUser("edge-deadline");
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 9);
    await seedGoal(u.db, u.userId, { deadline_date: soon.toISOString().slice(0, 10), deadline_hard: true });
    await applyCookie(context, u.cookie);
    await page.goto("/feed");
    await expect(page.locator("body")).toContainText("Off track");
    await page.goto("/goal");
    await expect(page.locator("body")).toContainText(/extend/i);
  });

  test("flagged résumé → editor shows 'needs your eyes', never hides the flag", async ({ page, context, newUser }) => {
    const u = await newUser("edge-flagged");
    const roles = await someRoleIds(u.db, 1);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, {
      status: "needs_your_eyes",
      violations: ["claim of leading a 40-person org overstates the profile"],
    });
    await applyCookie(context, u.cookie);
    await page.goto(`/studio/resume/${art}`);
    await expect(page.locator("body")).toContainText(/needs your eyes/i);
  });
});

async function applyCookie(context: import("@playwright/test").BrowserContext, cookie: string) {
  const cookies = cookie.split("; ").map((pair) => {
    const eq = pair.indexOf("=");
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: "127.0.0.1", path: "/", sameSite: "Lax" as const };
  });
  await context.addCookies(cookies);
}
