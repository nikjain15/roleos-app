import { test as base, type BrowserContext } from "@playwright/test";
import { createUser, hasSecrets, type SeededUser } from "./seed";
import { expectedOtpDelayMs } from "./otp-budget";

/**
 * Live-suite fixtures. `newUser` creates a throwaway seeded user and auto-cleans it
 * at test end. `applyAuth` injects the forged session cookie into a browser context
 * so authed pages render. The whole file is a no-op in CI (secrets absent) because
 * every spec guards on `hasSecrets`.
 */
export const test = base.extend<{ newUser: (tag?: string) => Promise<SeededUser> }>({
  newUser: async ({}, use, testInfo) => {
    const created: SeededUser[] = [];
    await use(async (tag) => {
      // T2: a paced OTP-budget wait must not read as a test hang — stretch
      // THIS test's timeout by the wait we're about to take (+ retry margin).
      const wait = expectedOtpDelayMs();
      if (wait > 0) testInfo.setTimeout(testInfo.timeout + wait + 30_000);
      const u = await createUser(tag);
      created.push(u);
      return u;
    });
    for (const u of created) await u.cleanup();
  },
});

export const expect = test.expect;
export { hasSecrets };

/** Parse the forged Cookie header into Playwright cookie objects for a context. */
export async function applyAuth(context: BrowserContext, user: SeededUser, host = "127.0.0.1") {
  const cookies = user.cookie.split("; ").map((pair) => {
    const eq = pair.indexOf("=");
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: host,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    };
  });
  await context.addCookies(cookies);
}
