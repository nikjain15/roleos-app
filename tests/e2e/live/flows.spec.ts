import { test, expect, hasSecrets } from "./fixtures";
import { seedGoal, seedMatch, seedArtifact, someRoleIds } from "./seed";

/**
 * D2 key authed flows end-to-end via the real APIs (no model calls) — the working
 * loop's write paths: set a goal → get a plan; track → advance; curate; export;
 * apply (human-gated record); correct the taste model. Each asserts the real
 * response + the resulting DB state.
 */
test.describe("authed flows produce real state", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("set a goal → a plan comes back with a verdict", async ({ request, newUser }) => {
    const u = await newUser("flow-goal");
    const res = await request.post("/api/goal", {
      headers: { cookie: u.cookie },
      data: { target: { archetype: "Senior AI PM" }, deadline_date: "2026-12-01", deadline_hard: true, intensity: { apps_per_week_ceiling: 15 } },
    });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { plan?: { feasibility?: { verdict?: string } } };
    expect(["on_track", "at_risk", "off_track"]).toContain(j.plan?.feasibility?.verdict);
  });

  test("tracker: create an application then advance it to applied", async ({ request, newUser }) => {
    const u = await newUser("flow-track");
    const roles = await someRoleIds(u.db, 1);
    const create = await request.post("/api/applications", { headers: { cookie: u.cookie }, data: { role_id: roles[0].id, stage: "saved" } });
    expect(create.status()).toBe(200);
    const { application } = (await create.json()) as { application: { id: string } };
    const adv = await request.patch("/api/applications", { headers: { cookie: u.cookie }, data: { id: application.id, stage: "applied" } });
    expect(adv.status()).toBe(200);
    const { data: row } = await u.db.from("applications").select("stage, sent_at").eq("id", application.id).single<{ stage: string; sent_at: string | null }>();
    expect(row!.stage).toBe("applied");
    expect(row!.sent_at).not.toBeNull(); // stamped on reaching 'applied'
  });

  test("curate: dismiss a match removes it from the active list", async ({ request, newUser }) => {
    const u = await newUser("flow-curate");
    const roles = await someRoleIds(u.db, 1);
    await seedMatch(u.db, u.userId, roles[0].id, "maybe", 60);
    const res = await request.post("/api/match/curate", { headers: { cookie: u.cookie }, data: { role_id: roles[0].id, action: "dismiss" } });
    expect(res.status()).toBe(200);
    const { data } = await u.db.from("matches").select("status").eq("user_id", u.userId).eq("role_id", roles[0].id).single<{ status: string }>();
    expect(data!.status).toBe("dismissed");
  });

  test("export: an approved résumé downloads as a real DOCX", async ({ request, newUser }) => {
    const u = await newUser("flow-export");
    const roles = await someRoleIds(u.db, 1);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    const res = await request.get(`/api/artifact/${art}/export?format=docx`, { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("wordprocessingml");
    expect((await res.body()).length).toBeGreaterThan(500);
  });

  test("apply (human-gated): records the send + advances the tracker, no transport", async ({ request, newUser }) => {
    const u = await newUser("flow-apply");
    const roles = await someRoleIds(u.db, 1);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    const res = await request.post("/api/apply", { headers: { cookie: u.cookie }, data: { artifactId: art } });
    expect(res.status()).toBe(200);
    const { data: app } = await u.db.from("applications").select("stage").eq("user_id", u.userId).eq("role_id", roles[0].id).single<{ stage: string }>();
    expect(app!.stage).toBe("applied");
    // the send gesture is recorded append-only
    const { data: ev } = await u.db.from("decision_events").select("action").eq("user_id", u.userId).eq("action", "send").limit(1);
    expect((ev ?? []).length).toBe(1);
  });

  test("taste: a correction sticks and reads back as the user's own", async ({ request, newUser }) => {
    const u = await newUser("flow-taste");
    const save = await request.post("/api/taste", { headers: { cookie: u.cookie }, data: { dimension: 5, confirmed: true, user_note: "I write my own résumé lines." } });
    expect(save.status()).toBe(200);
    const get = await request.get("/api/taste", { headers: { cookie: u.cookie } });
    const { dimensions } = (await get.json()) as { dimensions: Array<{ id: number; userConfirmed: boolean; inference: string | null }> };
    const dim5 = dimensions.find((d) => d.id === 5)!;
    expect(dim5.userConfirmed).toBe(true);
    expect(dim5.inference).toContain("write my own");
  });
});
