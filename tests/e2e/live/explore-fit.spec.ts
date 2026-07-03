import { createHash } from "node:crypto";
import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { seedMasterProfile, seedMatch, someRoleIds } from "./seed";
import AxeBuilder from "@axe-core/playwright";

/**
 * Fit-on-browse (slice W1, roles-workspace P0-7), live.
 *   • anon browsing /explore/company/<slug> sees the index UNCHANGED (no badges);
 *   • a signed-in user with a profile sees a per-role indicator: the REAL fit on
 *     roles the matcher scored, an honest estimate tier on the rest;
 *   • a signed-in user with no profile gets one honest way-forward hint, no crash;
 *   • cross-user RLS: A cannot read B's cached profile embedding;
 *   • the badged page stays axe-clean at 375px.
 *
 * The profile embedding is seeded directly (service role, hash matching the
 * seeded profile) so the test is deterministic and needs no Workers AI call —
 * the lazy-embed path degrades to "no estimates" by design when AI is absent.
 */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const PROFILE_RAW =
  "Senior AI product manager, 9 years across LLM products, agents, evals and growth. Looking for senior/staff PM roles at AI-native companies.";

async function seedProfileEmbedding(
  db: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  roleIdForVector: string,
) {
  // Use a real role's embedding as the "profile" vector → distance 0 to that
  // role, comfortably inside the strong band with the anchors below.
  const { data: emb } = await db.from("role_embeddings").select("embedding").eq("role_id", roleIdForVector).limit(1).single();
  const hash = createHash("sha256").update(PROFILE_RAW.trim()).digest("hex");
  const { error } = await db.from("profile_embeddings").upsert({
    user_id: userId,
    embedding: (emb as { embedding: unknown }).embedding,
    model: "@cf/baai/bge-base-en-v1.5",
    profile_hash: hash,
    d10: 0.25,
    d35: 0.32,
  });
  if (error) throw new Error(`seed profile_embeddings: ${error.message}`);
}

test.describe("fit-on-browse (P0-7)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local (service-role) — skipped in CI");

  test("anon sees the index unchanged — no fit badges", async ({ page }) => {
    const A = await someRoleIds((await import("./seed")).admin(), 1);
    await page.goto(`/explore/company/${slug(A[0].company)}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(A[0].company);
    await expect(page.locator("text=/· ?est/")).toHaveCount(0);
    await expect(page.locator("text=/^fit \\d+/")).toHaveCount(0);
    await expect(page.getByText("finish onboarding")).toHaveCount(0);
  });

  test("signed-in user sees real fit on scored roles and estimates on the rest", async ({ browser, newUser }) => {
    const U = await newUser("fitbrowse");
    const roles = await someRoleIds(U.db, 1);
    const roleId = roles[0].id;
    const company = roles[0].company;

    // Everything the browse path reads, seeded: profile, one scored match, cached embedding.
    await seedMasterProfile(U.db, U.userId, PROFILE_RAW);
    await seedMatch(U.db, U.userId, roleId, "pursue", 82);
    await seedProfileEmbedding(U.db, U.userId, roleId);

    const context = await browser.newContext();
    await applyAuth(context, U);
    const page = await context.newPage();
    await page.goto(`/explore/company/${slug(company)}`);

    // The scored role shows RO's real verdict badge.
    await expect(page.getByText(/fit 82 · pursue/).first()).toBeVisible();

    // Other roles at the company (if any) get estimate badges — assert only when
    // the company has more than the scored role, so the test isn't corpus-shape-dependent.
    const rows = await page.locator("main ul > li").count();
    if (rows > 1) {
      expect(await page.locator("text=/· ?est/").count()).toBeGreaterThan(0);
    }
    await context.close();
  });

  test("signed-in without a profile gets one honest way forward, not a crash", async ({ browser, newUser }) => {
    const U = await newUser("fitnoprof");
    const roles = await someRoleIds(U.db, 1);
    const context = await browser.newContext();
    await applyAuth(context, U);
    const page = await context.newPage();
    await page.goto(`/explore/company/${slug(roles[0].company)}`);
    await expect(page.getByText("finish onboarding")).toBeVisible();
    await expect(page.locator("text=/· ?est/")).toHaveCount(0);
    await context.close();
  });

  test("RLS: user A cannot read user B's cached profile embedding", async ({ newUser }) => {
    const A = await newUser("fitrls-a");
    const B = await newUser("fitrls-b");
    const roles = await someRoleIds(B.db, 1);
    await seedProfileEmbedding(B.db, B.userId, roles[0].id);

    // A's RLS-scoped client (anon key + A's session) must see zero rows — not B's.
    const { createClient } = await import("@supabase/supabase-js");
    const seed = await import("./seed");
    const cookieVal = A.cookie.split("=").slice(1).join("=");
    const session = JSON.parse(Buffer.from(cookieVal.replace(/^base64-/, ""), "base64").toString()) as {
      access_token: string;
    };
    const asA = createClient(seed.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false },
    });
    const { data } = await asA.from("profile_embeddings").select("user_id, profile_hash");
    expect(data ?? []).toEqual([]);

    // And A cannot write a row for B either.
    const { error } = await asA
      .from("profile_embeddings")
      .insert({ user_id: B.userId, embedding: Array(768).fill(0), model: "x", profile_hash: "y" });
    expect(error).not.toBeNull();
  });

  test("badged explore page stays axe-clean at 375px", async ({ browser, newUser }) => {
    const U = await newUser("fita11y");
    const roles = await someRoleIds(U.db, 1);
    await seedMasterProfile(U.db, U.userId, PROFILE_RAW);
    await seedMatch(U.db, U.userId, roles[0].id, "pursue", 77);
    await seedProfileEmbedding(U.db, U.userId, roles[0].id);

    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await applyAuth(context, U);
    const page = await context.newPage();
    await page.goto(`/explore/company/${slug(roles[0].company)}`);
    await expect(page.getByText(/fit 77 · pursue/).first()).toBeVisible();

    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noHScroll).toBe(true);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => v.id)).toEqual([]);
    await context.close();
  });
});
