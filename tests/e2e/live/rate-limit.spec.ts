import { test, expect, hasSecrets } from "./fixtures";
import { admin } from "./seed";

/**
 * Slice H3 — rate limits live. The window is SEEDED directly into rate_events,
 * so every 429 asserts the guard fires BEFORE any model call is spent. Also
 * probes that clients can't read or write the limiter's table (RLS deny-all).
 */
async function seedWindow(scope: string, subject: string, n: number) {
  const db = admin();
  await db.from("rate_events").insert(Array.from({ length: n }, () => ({ scope, subject })));
  return async () => {
    await db.from("rate_events").delete().eq("scope", scope).eq("subject", subject);
  };
}

test.describe("rate limiting (H3)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("anon explore ask 429s once the IP window is full — before any model call", async ({ request }) => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}`;
    const cleanup = await seedWindow("explore_ask", ip, 20);
    try {
      const res = await request.post("/api/explore/ask", {
        headers: { "x-forwarded-for": ip },
        data: { question: "who sponsors visas?" },
      });
      expect(res.status()).toBe(429);
      expect(((await res.json()) as { error: string }).error).toContain("share your profile");
    } finally {
      await cleanup();
    }
  });

  test("anon onboarding 429s once the IP window is full", async ({ request }) => {
    const ip = `203.0.113.${Math.floor(Math.random() * 250)}`;
    const cleanup = await seedWindow("onboard", ip, 5);
    try {
      const res = await request.post("/api/onboard", {
        headers: { "x-forwarded-for": ip },
        data: { profile: "Senior PM with nine years of payments and AI product experience." },
      });
      expect(res.status()).toBe(429);
    } finally {
      await cleanup();
    }
  });

  test("authed rematch + tailor 429 per user once their window is full", async ({ request, newUser }) => {
    const u = await newUser("h3-limits");
    await seedWindow("rematch", u.userId, 6);
    await seedWindow("tailor", u.userId, 12);

    expect((await request.post("/api/rematch", { headers: { cookie: u.cookie } })).status()).toBe(429);
    const t = await request.post("/api/tailor", {
      headers: { cookie: u.cookie },
      data: { roleId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(t.status()).toBe(429); // limited before the role lookup or any model call
  });

  test("below the window, requests pass the limiter (guard doesn't overfire)", async ({ request, newUser }) => {
    const u = await newUser("h3-under");
    // No seeded events: rematch proceeds past the limiter (it may fail later
    // for no-profile — that's a 500 with an honest message, NOT a 429).
    const res = await request.post("/api/rematch", { headers: { cookie: u.cookie } });
    expect(res.status()).not.toBe(429);
  });

  test("RLS: clients can neither read nor write rate_events", async ({ newUser }) => {
    const u = await newUser("h3-rls");
    const { createClient } = await import("@supabase/supabase-js");
    const seed = await import("./seed");
    const cookieVal = u.cookie.split("=").slice(1).join("=");
    const session = JSON.parse(Buffer.from(cookieVal.replace(/^base64-/, ""), "base64").toString()) as {
      access_token: string;
    };
    const asUser = createClient(seed.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false },
    });
    const { data } = await asUser.from("rate_events").select("scope").limit(1);
    expect(data ?? []).toEqual([]);
    const { error } = await asUser.from("rate_events").insert({ scope: "explore_ask", subject: "hax" });
    expect(error).not.toBeNull(); // deny-all: nobody resets or forges windows
  });
});
