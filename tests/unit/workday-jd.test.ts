import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWorkdayJobDescription } from "@/lib/ats";

/**
 * Workday JD enrichment. The board list carries no description, so without this
 * the extractor classified enterprise roles from a title alone — the reason
 * archetypes were least reliable at exactly the firms Workday was added for.
 * The API path has to be rebuilt from the public url, so url parsing is the
 * whole risk surface here.
 */
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
afterEach(() => vi.unstubAllGlobals());

describe("fetchWorkdayJobDescription", () => {
  it("rebuilds the cxs api path from the public job url", async () => {
    const f = vi.fn(async (..._a: unknown[]) => ok({ jobPostingInfo: { jobDescription: "<p>Real JD</p>" } }));
    vi.stubGlobal("fetch", f);
    const out = await fetchWorkdayJobDescription(
      "https://capgroup.wd1.myworkdayjobs.com/capitalgroupcareers/job/Irvine/Some-Role_JR1",
    );
    expect(String(f.mock.calls[0]?.[0])).toBe(
      "https://capgroup.wd1.myworkdayjobs.com/wday/cxs/capgroup/capitalgroupcareers/job/Irvine/Some-Role_JR1",
    );
    expect(out).toBe("Real JD");
  });

  it("strips html rather than embedding markup in the corpus", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ jobPostingInfo: { jobDescription: "<p>One</p><p>Two</p>" } })));
    const out = await fetchWorkdayJobDescription("https://x.wd1.myworkdayjobs.com/site/job/L/T_R1");
    expect(out).not.toContain("<p>");
    expect(out).toContain("One");
  });

  it("returns null instead of throwing when the job is gone or malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    expect(await fetchWorkdayJobDescription("https://x.wd1.myworkdayjobs.com/site/job/L/T_R1")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
    expect(await fetchWorkdayJobDescription("https://x.wd1.myworkdayjobs.com/site/job/L/T_R1")).toBeNull();
  });

  it("returns null for urls it cannot address, without firing a request", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await fetchWorkdayJobDescription("not-a-url")).toBeNull();
    expect(await fetchWorkdayJobDescription("https://x.wd1.myworkdayjobs.com/")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("treats an empty description as absent, so the composed fallback is kept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ jobPostingInfo: { jobDescription: "" } })));
    expect(await fetchWorkdayJobDescription("https://x.wd1.myworkdayjobs.com/site/job/L/T_R1")).toBeNull();
  });
});
