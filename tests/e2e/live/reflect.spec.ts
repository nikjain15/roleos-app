import { test, expect, hasSecrets } from "./fixtures";
import { admin, seedApplication, seedGoal, someRoleIds } from "./seed";

/**
 * X11 — rejection→growth. The reflection is DETERMINISTIC (no model call), so the
 * grounded copy is proven in tests/unit/rejection-growth.test.ts. Here we assert
 * the request-level guarantees: offered only for rejected apps, records a reason
 * without changing or sending anything, RLS isolation, and the append-only
 * idempotency guard.
 */

test.describe("reflect / rejection→growth (X11)", () => {
  test.skip(!hasSecrets, "needs .env.local secrets");

  test("a rejected app renders the reflection + reason picker, never a verdict", async ({ request, newUser }) => {
    const u = await newUser("x11-page");
    const roles = await someRoleIds(u.db, 1);
    const gid = await seedGoal(u.db, u.userId, {});
    const appId = await seedApplication(u.db, u.userId, roles[0].id, gid, "rejected");

    const res = await request.get(`/reflect/${appId}`, { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("What the data actually says");
    expect(html).toContain("One thing to try next");
    expect(html).toContain("Never heard back"); // a reason option is present
    expect(html).toContain("one data point"); // base-rate honesty, not a verdict
  });

  test("a non-rejected app is redirected away — reflection is rejected-only", async ({ request, newUser }) => {
    const u = await newUser("x11-notrej");
    const roles = await someRoleIds(u.db, 1);
    const gid = await seedGoal(u.db, u.userId, {});
    const appId = await seedApplication(u.db, u.userId, roles[0].id, gid, "applied");

    const res = await request.get(`/reflect/${appId}`, { headers: { cookie: u.cookie }, maxRedirects: 0 });
    expect([302, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/tracker");
  });

  test("submitting a reason writes exactly one reflection event, changes no stage, sends nothing", async ({
    request,
    newUser,
  }) => {
    const u = await newUser("x11-submit");
    const roles = await someRoleIds(u.db, 1);
    const gid = await seedGoal(u.db, u.userId, {});
    const appId = await seedApplication(u.db, u.userId, roles[0].id, gid, "rejected");

    const res = await request.post("/api/reflection", {
      headers: { cookie: u.cookie, "Content-Type": "application/json" },
      data: { applicationId: appId, reason: "after_interview", note: "great final round" },
    });
    expect(res.status()).toBe(200);

    // Exactly one reflection event, with our reason.
    const { data: events } = await admin()
      .from("decision_events")
      .select("kind, action, payload")
      .eq("kind", "reflection")
      .eq("subject_ref", appId);
    expect(events?.length).toBe(1);
    expect(events?.[0].action).toBe("correct"); // allowed action; no migration
    expect((events?.[0].payload as { reason: string }).reason).toBe("after_interview");

    // The application's stage is untouched — reflection records, it never acts.
    const { data: app } = await admin().from("applications").select("stage").eq("id", appId).single();
    expect(app?.stage).toBe("rejected");

    // Idempotency: the same answer again does NOT pile up a second event.
    const again = await request.post("/api/reflection", {
      headers: { cookie: u.cookie, "Content-Type": "application/json" },
      data: { applicationId: appId, reason: "after_interview", note: "great final round" },
    });
    expect(again.status()).toBe(200);
    const { data: after } = await admin()
      .from("decision_events")
      .select("id")
      .eq("kind", "reflection")
      .eq("subject_ref", appId);
    expect(after?.length).toBe(1);
  });

  test("cannot reflect on someone else's application (RLS)", async ({ request, newUser }) => {
    const owner = await newUser("x11-owner");
    const intruder = await newUser("x11-intruder");
    const roles = await someRoleIds(owner.db, 1);
    const gid = await seedGoal(owner.db, owner.userId, {});
    const appId = await seedApplication(owner.db, owner.userId, roles[0].id, gid, "rejected");

    const res = await request.post("/api/reflection", {
      headers: { cookie: intruder.cookie, "Content-Type": "application/json" },
      data: { applicationId: appId, reason: "not_a_fit" },
    });
    expect(res.status()).toBe(404); // RLS hides it → not found, never someone else's row

    const { data: events } = await admin()
      .from("decision_events")
      .select("id")
      .eq("kind", "reflection")
      .eq("subject_ref", appId);
    expect(events?.length ?? 0).toBe(0);
  });

  test("API requires auth", async ({ request }) => {
    const res = await request.post("/api/reflection", {
      data: { applicationId: "00000000-0000-0000-0000-000000000000", reason: "other" },
    });
    expect(res.status()).toBe(401);
  });
});
