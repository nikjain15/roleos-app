import { test, expect, hasSecrets } from "./fixtures";

/**
 * D6 API contract matrix (live) — every mutating route must (a) reject the
 * unauthenticated (401) or the secretless cron caller (403), and (b) reject a
 * malformed body with 400 (zod), never 500. This locks the auth + validation
 * surface across the whole API in one place.
 */
const UUID = "00000000-0000-0000-0000-000000000000";

test.describe("API authz: unauthenticated is rejected", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  const unauth: Array<[string, "get" | "post" | "patch", object?]> = [
    ["/api/goal", "post", { target: {} }],
    ["/api/applications", "post", { role_id: UUID }],
    ["/api/applications", "patch", { id: UUID, stage: "applied" }],
    ["/api/match/curate", "post", { role_id: UUID, action: "dismiss" }],
    ["/api/nudge", "get"],
    ["/api/nudge", "post", { id: UUID }],
    ["/api/taste", "get"],
    ["/api/taste", "post", { dimension: 1, confirmed: true }],
    ["/api/ro/ask", "post", { question: "hi" }],
    ["/api/apply", "post", { artifactId: UUID }],
    ["/api/cover", "post", { roleId: UUID }],
    [`/api/artifact/${UUID}/edit`, "patch", { content: {} }],
    [`/api/artifact/${UUID}/reground`, "post", { bulletIndex: 0 }],
    [`/api/artifact/${UUID}/export?format=docx`, "get"],
  ];

  for (const [path, method, body] of unauth) {
    test(`${method.toUpperCase()} ${path} → 401 without a session`, async ({ request }) => {
      const res = await request[method](path, body ? { data: body } : {});
      expect(res.status(), `${method} ${path}`).toBe(401);
    });
  }

  const cron = ["/api/cron/nudges", "/api/cron/digests", "/api/cron/ingest"];
  for (const path of cron) {
    test(`POST ${path} → 403 without the cron secret`, async ({ request }) => {
      expect((await request.post(path)).status()).toBe(403);
    });
  }
});

test.describe("API validation: a malformed body is 400, never 500", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  const cases: Array<[string, "post" | "patch", object]> = [
    ["/api/goal", "post", { deadline_date: "not-a-date" }],
    ["/api/applications", "post", { role_id: "not-a-uuid" }],
    ["/api/applications", "patch", { id: UUID, stage: "not-a-stage" }],
    ["/api/match/curate", "post", { role_id: UUID, action: "bogus" }],
    ["/api/ro/ask", "post", { question: "" }],
    ["/api/taste", "post", { dimension: 99, confirmed: true }],
    ["/api/apply", "post", {}],
    ["/api/cover", "post", { roleId: "not-a-uuid" }],
  ];

  for (const [path, method, body] of cases) {
    test(`${method.toUpperCase()} ${path} with a bad body → 400`, async ({ request, newUser }) => {
      const u = await newUser("contract");
      const res = await request[method](path, { headers: { cookie: u.cookie }, data: body });
      expect(res.status(), `${method} ${path}`).toBe(400);
    });
  }
});
