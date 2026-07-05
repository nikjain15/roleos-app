import { test, expect, hasSecrets } from "./fixtures";
import { seedGoal, seedMatch, seedArtifact, seedApplication, someRoleIds } from "./seed";

/**
 * Prod authed health check (opt-in). Forges a session, seeds a hunt, and confirms
 * every authenticated surface on the LIVE app returns non-5xx — the fast way to
 * catch a broken deploy / missing migration in prod. Read-mostly + cleans up.
 *
 * Run: E2E_PROD=1 PW_BASE_URL=https://ro.roleos.fyi npm run test:e2e:live -- prod.spec.ts
 * (or `npm run test:e2e:prod`). Skipped unless E2E_PROD is set.
 */
test.describe("prod: authed surfaces are healthy", () => {
  test.skip(!hasSecrets || !process.env.E2E_PROD, "set E2E_PROD=1 + PW_BASE_URL=https://ro.roleos.fyi");

  test("no 5xx on any authed page or read API", async ({ request, newUser }) => {
    const u = await newUser("prodhealth");
    const roles = await someRoleIds(u.db, 3);
    const gid = await seedGoal(u.db, u.userId, { deadline_date: "2026-12-01", intensity: { apps_per_week_ceiling: 20 } });
    for (const r of roles) await seedMatch(u.db, u.userId, r.id, "pursue", 80);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    await seedApplication(u.db, u.userId, roles[1].id, gid, "applied");

    const surfaces = [
      "/feed", "/goal", "/roles", "/tracker", "/settings", "/watch",
      // X-era surfaces (merged + live): offer co-pilot, weekly review.
      "/offers", "/review",
      `/studio/resume/${art}`, `/apply/${art}`, "/api/nudge", "/api/taste",
      // X5's benchmark read (authed GET; unknown archetype must still be non-5xx).
      "/api/comp-benchmark",
    ];
    const H = { headers: { cookie: u.cookie }, maxRedirects: 0 };
    for (const s of surfaces) {
      const res = await request.get(s, H);
      expect(res.status(), `prod ${s}`).toBeLessThan(500);
    }
  });

  test("H1 health endpoint answers 200 with a real body", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { ok?: boolean; status?: string };
    expect(j.ok ?? j.status !== undefined).toBeTruthy();
  });

  test("cron endpoints are secret-gated in prod (403 to strangers)", async ({ request }) => {
    // The ambient scheduler's work routes must never be publicly triggerable —
    // this is the live check that the CRON_SECRET gate actually deployed.
    for (const path of ["/api/cron/digests", "/api/cron/nudges", "/api/cron/ingest", "/api/cron/yc-sync"]) {
      const res = await request.post(path, { headers: { "x-cron-secret": "not-the-secret" } });
      expect(res.status(), `prod ${path}`).toBe(403);
    }
  });
});
