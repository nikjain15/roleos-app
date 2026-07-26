import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The live tools are DB-backed (not `{ todo: "phase 2" }` placeholders):
 *   - search_roles → recallRolesMulti over the live corpus
 *   - get_master_profile → the user's row, scoped by ctx.userId
 *   - get_role → one role by id from the global corpus
 * lib/match and the Supabase service client are mocked so no network/DB is hit.
 */

const { recallRolesMulti, maybeSingle, eq, select, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { recallRolesMulti: vi.fn(), maybeSingle, eq, select, from };
});
vi.mock("@/lib/match", () => ({ recallRolesMulti }));
vi.mock("@/lib/supabase/service", () => ({ supabaseService: () => ({ from }) }));

import { tools, liveTools, isLiveTool, LIVE_TOOL_NAMES } from "@/agent/tools";

beforeEach(() => {
  recallRolesMulti.mockReset();
  maybeSingle.mockReset();
  from.mockClear();
  select.mockClear();
  eq.mockClear();
});

describe("agent tools · live bodies", () => {
  it("search_roles returns real corpus hits, not a placeholder", async () => {
    recallRolesMulti.mockResolvedValue({
      poolSize: 557,
      candidates: [
        { id: "r1", company: "Acme", role_title: "AI PM", archetype: "aipm", distance: 0.12 },
      ],
    });
    const out = (await tools.search_roles.run({ query: "ai pm", limit: 5 }, { userId: "u1" })) as {
      poolSize: number;
      roles: Array<{ id: string }>;
    };
    expect(recallRolesMulti).toHaveBeenCalledWith(["ai pm"], 5);
    expect(out.poolSize).toBe(557);
    expect(out.roles[0].id).toBe("r1");
  });

  it("get_master_profile reads the user's row scoped by ctx.userId", async () => {
    maybeSingle.mockResolvedValue({ data: { data: { name: "Nik" } }, error: null });
    const out = (await tools.get_master_profile.run({}, { userId: "u1" })) as {
      found: boolean;
      profile: unknown;
    };
    expect(from).toHaveBeenCalledWith("master_profile");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(out.found).toBe(true);
    expect(out.profile).toEqual({ name: "Nik" });
  });

  it("get_master_profile refuses to run without a user", async () => {
    await expect(tools.get_master_profile.run({}, { userId: "" })).rejects.toThrow(/no user/);
  });

  it("get_role reads one role by id", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "r9", role_title: "FDE" }, error: null });
    const out = (await tools.get_role.run({ id: "r9" }, { userId: "u1" })) as {
      found: boolean;
      role: { id: string };
    };
    expect(from).toHaveBeenCalledWith("roles");
    expect(eq).toHaveBeenCalledWith("id", "r9");
    expect(out.found).toBe(true);
    expect(out.role.id).toBe("r9");
  });

  it("liveTools filters declared names to DB-backed tools only", () => {
    const live = liveTools(["get_master_profile", "get_role", "diff", "get_taste_model"]);
    expect(live.map((t) => t.name)).toEqual(["get_master_profile", "get_role"]);
    expect(isLiveTool("search_roles")).toBe(true);
    expect(isLiveTool("diff")).toBe(false);
    expect([...LIVE_TOOL_NAMES]).toContain("search_roles");
  });
});
