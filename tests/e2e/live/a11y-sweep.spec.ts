import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { seedMasterProfile, seedGoal, seedMatch, seedArtifact, seedApplication, someRoleIds } from "./seed";
import { expectNoSeriousA11y } from "../helpers/axe";

/**
 * D5 + D7 across EVERY authenticated screen (live). Seeds a full hunt once, then
 * loads each screen at 375px and asserts no horizontal overflow + 0 serious/critical
 * axe violations. This is the sweep that caught the /feed overflow — it generalizes
 * that check to every signed-in surface so a future overflow/contrast bug fails here.
 */
test.describe("authed a11y + responsive sweep (375px)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local (service-role) — skipped in CI");

  test("every authed screen: no h-overflow + no serious axe violations at 375px", async ({ page, context, newUser }) => {
    const u = await newUser("a11y");
    const roles = await someRoleIds(u.db, 4);
    await seedMasterProfile(u.db, u.userId, "Senior PM, 10 years in payments & fraud ML.");
    const gid = await seedGoal(u.db, u.userId, { deadline_date: "2026-12-01", intensity: { apps_per_week_ceiling: 20 } });
    for (const r of roles) await seedMatch(u.db, u.userId, r.id, "pursue", 80);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    await seedApplication(u.db, u.userId, roles[1].id, gid, "applied");

    await applyAuth(context, u);
    await page.setViewportSize({ width: 375, height: 812 });

    const screens = [
      "/feed", "/goal", "/roles", "/tracker", "/settings", "/watch", "/review", "/offers",
      "/connections", "/ready-room", "/reply-desk", // X6, X10, X9 — controls must hold up at 375px
      `/studio/resume/${art}`, `/apply/${art}`,
    ];

    for (const path of screens) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      // Let client components (dock, cards, taste dims) settle.
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path} @375px`).toBeLessThanOrEqual(1);
      await expectNoSeriousA11y(page, `${path} @375px (authed)`);
    }
  });
});
