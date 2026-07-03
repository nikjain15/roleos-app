import { test, expect, hasSecrets } from "./fixtures";
import { seedGoal, seedArtifact, seedApplication, someRoleIds } from "./seed";

/**
 * D6 cross-user RLS probe (the real leak test, live). User B owns a goal + résumé +
 * application; user A — fully signed in — must NOT be able to read or mutate any of
 * B's rows through the app's routes. RLS should filter B's data to nothing under A's
 * session, so every probe returns not-found / blocked, never B's content.
 */
test.describe("RLS: a signed-in user cannot touch another user's data", () => {
  test.skip(!hasSecrets, "live suite needs .env.local (service-role) — skipped in CI");

  test("user A is blocked from user B's résumé, apply, and pages", async ({ request, newUser }) => {
    const A = await newUser("rls-a");
    const B = await newUser("rls-b");
    const roles = await someRoleIds(B.db, 2);

    // Seed B's private hunt.
    const bGoal = await seedGoal(B.db, B.userId, { deadline_date: "2026-12-01" });
    const bArtifact = await seedArtifact(B.db, B.userId, roles[0].id, { status: "approved" });
    await seedApplication(B.db, B.userId, roles[1].id, bGoal, "applied");

    const asA = { headers: { cookie: A.cookie } };

    // Sanity: A is genuinely authed (own nudge feed → 200).
    expect((await request.get("/api/nudge", asA)).status()).toBe(200);

    // A cannot READ B's résumé via the apply page → not found (RLS filtered).
    expect((await request.get(`/apply/${bArtifact}`, { ...asA, maxRedirects: 0 })).status()).toBe(404);

    // A cannot MUTATE B's résumé (edit) → not found, not 200.
    const edit = await request.patch(`/api/artifact/${bArtifact}/edit`, {
      ...asA,
      data: { content: { summary: "hijacked" } },
    });
    expect(edit.status()).toBe(404);

    // A cannot APPLY with B's résumé → not found.
    const apply = await request.post("/api/apply", { ...asA, data: { artifactId: bArtifact } });
    expect(apply.status()).toBe(404);

    // A cannot EXPORT B's résumé → not found.
    expect((await request.get(`/api/artifact/${bArtifact}/export?format=docx`, asA)).status()).toBe(404);

    // And B's data is untouched (still B's summary, not "hijacked").
    const { data: still } = await B.db.from("artifacts").select("content").eq("id", bArtifact).single<{ content: { summary: string } }>();
    expect(still!.content.summary).not.toBe("hijacked");
  });
});
