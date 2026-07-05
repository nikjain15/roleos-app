import { test, expect, hasSecrets } from "./fixtures";
import { admin, seedApplication, seedArtifact, seedMatch } from "./seed";

/**
 * X4 — outcome-learning fit model, driven request-level against server-rendered
 * pages (no client JS needed). Real outcomes seeded through the funnel of
 * record must (a) surface an explained fit adjustment on /roles and /feed,
 * (b) calibrate the X3 score card on /apply, (c) never leak across users, and
 * (d) leave everything untouched for a user with no history.
 */

/** Corpus roles grouped by archetype: 2 win-roles + 2 loss-roles + 1 fresh match. */
async function pickRoles(): Promise<{ winArch: string[]; lossArch: string[]; fresh: string } | null> {
  const { data } = await admin()
    .from("roles")
    .select("id, archetype")
    .not("archetype", "is", null)
    .limit(400);
  const byArch = new Map<string, string[]>();
  for (const r of data ?? []) {
    const a = r.archetype as string;
    byArch.set(a, [...(byArch.get(a) ?? []), r.id as string]);
  }
  const rich = [...byArch.entries()].filter(([, ids]) => ids.length >= 3);
  if (rich.length < 2) return null;
  const [a1, a2] = rich;
  return { winArch: a1[1].slice(0, 3), lossArch: a2[1].slice(0, 2), fresh: a1[1][2] };
}

test.describe("outcome-learning (X4)", () => {
  test.skip(!hasSecrets, "needs .env.local secrets");

  test("wins clustered in an archetype lift matching fresh roles — chip on /roles and /feed", async ({
    request,
    newUser,
  }) => {
    const roles = await pickRoles();
    test.skip(!roles, "corpus lacks two archetypes with enough roles");
    const u = await newUser("x4-lift");

    // Funnel truth: 2 screens in winArch, 2 silent rejections in lossArch.
    await seedApplication(u.db, u.userId, roles!.winArch[0], null, "screening");
    await seedApplication(u.db, u.userId, roles!.winArch[1], null, "interviewing");
    await seedApplication(u.db, u.userId, roles!.lossArch[0], null, "rejected");
    await seedApplication(u.db, u.userId, roles!.lossArch[1], null, "rejected");
    // A fresh recommendation in the winning archetype.
    await seedMatch(u.db, u.userId, roles!.fresh, "pursue", 70);

    for (const path of ["/roles", "/feed"]) {
      const res = await request.get(path, { headers: { cookie: u.cookie } });
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain("your track record");
      expect(html).toContain("→"); // base fit stays visible next to the adjusted one
    }
  });

  test("no outcomes → no chip, page renders exactly as before", async ({ request, newUser }) => {
    const u = await newUser("x4-clean");
    const { data } = await admin().from("roles").select("id").limit(1);
    await seedMatch(u.db, u.userId, data![0].id as string, "pursue", 70);

    const res = await request.get("/roles", { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("your track record");
    expect(html).toMatch(/fit (<!-- -->)?70/); // RSC comment node between text + expression
  });

  test("RLS: user B's outcomes never touch user A's fit (cross-user probe)", async ({ request, newUser }) => {
    const roles = await pickRoles();
    test.skip(!roles, "corpus lacks two archetypes with enough roles");
    const a = await newUser("x4-a");
    const b = await newUser("x4-b");

    // B has a strong track record in the archetype; A merely has a fresh match there.
    await seedApplication(b.db, b.userId, roles!.winArch[0], null, "screening");
    await seedApplication(b.db, b.userId, roles!.winArch[1], null, "screening");
    await seedApplication(b.db, b.userId, roles!.lossArch[0], null, "rejected");
    await seedMatch(a.db, a.userId, roles!.fresh, "pursue", 70);

    const res = await request.get("/roles", { headers: { cookie: a.cookie } });
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain("your track record");
  });

  test("X3 calibration read-back on /apply: past 'high' scores show honest n", async ({ request, newUser }) => {
    const roles = await pickRoles();
    test.skip(!roles, "corpus lacks two archetypes with enough roles");
    const u = await newUser("x4-cal");

    // Two scored applications with decided outcomes: one screened, one rejected.
    await seedApplication(u.db, u.userId, roles!.winArch[0], null, "screening");
    await seedApplication(u.db, u.userId, roles!.lossArch[0], null, "rejected");
    for (const roleId of [roles!.winArch[0], roles!.lossArch[0]]) {
      await admin().from("decision_events").insert({
        user_id: u.userId,
        kind: "app_score",
        action: "view",
        payload: { role_id: roleId, score: 78, likelihood: "high" },
      });
    }

    // An approved résumé for a third role, already scored 'high' (X3 provenance).
    const artifactId = await seedArtifact(u.db, u.userId, roles!.fresh, { status: "approved" });
    await admin()
      .from("artifacts")
      .update({
        provenance: {
          truth: { ok: true, violations: [] },
          app_score: {
            score: 80,
            screen_likelihood: "high",
            strengths: ["real strength"],
            weak_spots: [],
            note: "",
          },
        },
      })
      .eq("id", artifactId);

    const res = await request.get(`/apply/${artifactId}`, { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Your past &#x27;high&#x27; scores converted 1/2");
    expect(html).toContain("read gently");
  });

  test("no scored history → the score card shows no calibration line", async ({ request, newUser }) => {
    const u = await newUser("x4-nocal");
    const { data } = await admin().from("roles").select("id").limit(1);
    const artifactId = await seedArtifact(u.db, u.userId, data![0].id as string, { status: "approved" });
    await admin()
      .from("artifacts")
      .update({
        provenance: {
          truth: { ok: true, violations: [] },
          app_score: { score: 80, screen_likelihood: "high", strengths: [], weak_spots: [], note: "" },
        },
      })
      .eq("id", artifactId);

    const res = await request.get(`/apply/${artifactId}`, { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain("scores converted");
  });
});
