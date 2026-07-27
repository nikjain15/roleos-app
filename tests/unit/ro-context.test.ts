import { describe, it, expect } from "vitest";
import { profileSummary, toRoAskState, type RoContext } from "@/lib/ro/context";
import { parseCanonicalProfile } from "@/lib/profile-schema";

/**
 * M0 — the shared working-context assembler's PURE parts: compacting the canonical
 * profile to the few facts RO needs, and shaping the dock's grounding state.
 */

describe("profileSummary — compact, bounded", () => {
  it("pulls name/headline/seniority, caps skills + roles, joins the target", () => {
    const profile = parseCanonicalProfile(
      {
        version: 1,
        identity: { name: { value: "Nik Jain", source: "user", confidence: 1, at: "" }, headline: { value: "AI PM" } },
        experience: [
          { title: "Director", company: "Fidelity", highlights: [], source: "resume", confidence: 1 },
          { title: "Co-Founder", company: "CredR", highlights: [], source: "resume", confidence: 1 },
        ],
        skills: Array.from({ length: 12 }, (_, i) => ({ canonical: `Skill${i}`, source: "resume", confidence: 1 })),
        signals: { domains: [], strengths: [], seniority: "senior", target: { role: "AI PM", level: "Staff", comp: "$250k", cares_about: [] } },
      },
      { defaultSource: "resume", at: "" },
    );
    const s = profileSummary(profile);
    expect(s.name).toBe("Nik Jain");
    expect(s.headline).toBe("AI PM");
    expect(s.seniority).toBe("senior");
    expect(s.topSkills).toHaveLength(8); // capped
    expect(s.recentRoles).toEqual(["Director @ Fidelity", "Co-Founder @ CredR"]);
    expect(s.target).toBe("AI PM · Staff · $250k");
  });

  it("handles an empty profile without target", () => {
    const s = profileSummary(parseCanonicalProfile({}, { defaultSource: "resume", at: "" }));
    expect(s.name).toBeUndefined();
    expect(s.topSkills).toEqual([]);
    expect(s.recentRoles).toEqual([]);
    expect(s.target).toBeUndefined();
  });
});

describe("toRoAskState — the dock's grounding shape", () => {
  it("exposes profile + top_pursue + goal + pipeline", () => {
    const ctx: RoContext = {
      profile: { topSkills: ["ML"], recentRoles: ["PM @ Acme"] },
      goal: { target: "ai_pm", deadline: null, verdict: "ok", weekly_apps_target: 5, best_lever: null },
      pipeline: { pursue_matches: 3, saved: 1, applied: 2, interviewing: 1, offers: 0, resumes_ready: 1 },
      topPursue: [{ id: "r1", company: "Scale", title: "PM" }],
    };
    const state = toRoAskState(ctx);
    expect(state.profile?.topSkills).toEqual(["ML"]);
    expect(state.top_pursue).toEqual([{ id: "r1", company: "Scale", title: "PM" }]);
    expect(state.goal?.target).toBe("ai_pm");
    expect(state.pipeline.pursue_matches).toBe(3);
  });
});
