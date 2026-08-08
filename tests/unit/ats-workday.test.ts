import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWorkday, fetchCompanyPostings } from "@/lib/ats";

/**
 * Workday board fetching. This is how most large enterprises post (banks, asset
 * managers, F500), and it differs from the other providers in two ways that
 * matter: it needs three coordinates rather than one slug, and its boards are
 * big enough that we deliberately stop paging — which makes "did we see the
 * whole board?" a correctness question, not a detail. Pruning a truncated scan
 * would archive live roles.
 */
const page = (n: number, start = 0) => ({
  jobPostings: Array.from({ length: n }, (_, i) => ({
    title: `Product Manager ${start + i}`,
    externalPath: `/job/NY/Product-Manager-${start + i}_R${start + i}`,
    locationsText: "New York",
    bulletFields: [`R${start + i}`],
  })),
});
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

afterEach(() => vi.unstubAllGlobals());

describe("fetchWorkday", () => {
  it("pages until a short page and reports the board as complete", async () => {
    const pages = [page(20), page(20, 20), page(7, 40)];
    let i = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ok(pages[i++])));
    const { posts, truncated } = await fetchWorkday("capgroup/wd1/capitalgroupcareers", "Capital Group");
    expect(posts).toHaveLength(47);
    expect(truncated).toBe(false);
  });

  it("flags truncation when the board outruns the page cap", async () => {
    // Always a full page: the board never ends within the cap.
    vi.stubGlobal("fetch", vi.fn(async () => ok(page(20))));
    const { posts, truncated } = await fetchWorkday("statestreet/wd1/Global", "State Street");
    expect(truncated).toBe(true);
    expect(posts.length).toBe(15 * 20); // WORKDAY_PAGE_CAP pages
  });

  it("builds the public job url from tenant, site and externalPath", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok(page(1))));
    const { posts } = await fetchWorkday("capgroup/wd1/capitalgroupcareers", "Capital Group");
    expect(posts[0].url).toBe(
      "https://capgroup.wd1.myworkdayjobs.com/capitalgroupcareers/job/NY/Product-Manager-0_R0",
    );
    expect(posts[0].provider).toBe("workday");
    expect(posts[0].externalId).toBe("wd_R0");
  });

  it("returns nothing for malformed coordinates rather than guessing a url", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await fetchWorkday("capgroup", "Capital Group")).posts).toEqual([]);
    expect((await fetchWorkday("", "X")).posts).toEqual([]);
    expect(f).not.toHaveBeenCalled(); // never fires a request it can't address
  });

  it("survives a board that errors mid-page without losing what it read", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (n++ === 1) throw new Error("network");
      return ok(page(20));
    }));
    const { posts } = await fetchWorkday("x/wd1/site", "X");
    expect(posts).toHaveLength(20);
  });
});

describe("fetchCompanyPostings routing", () => {
  it("uses Workday only when the company is configured for it", async () => {
    const f = vi.fn(async (..._a: unknown[]) => ok(page(3)));
    vi.stubGlobal("fetch", f);
    const r = await fetchCompanyPostings("Capital Group", "capgroup/wd1/capitalgroupcareers", undefined, "workday");
    expect(r.posts).toHaveLength(3);
    expect(String(f.mock.calls[0]?.[0])).toContain("myworkdayjobs.com/wday/cxs");
  });

  it("does not try Workday for a normal ATS company", async () => {
    const f = vi.fn(async (..._a: unknown[]) => ok({ jobs: [] }));
    vi.stubGlobal("fetch", f);
    await fetchCompanyPostings("Stripe", "stripe");
    expect(f.mock.calls.every((c) => !String(c?.[0]).includes("myworkdayjobs"))).toBe(true);
  });
});
