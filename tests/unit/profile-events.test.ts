import { describe, it, expect } from "vitest";
import { applyProfileEdit, profileEditEvent } from "@/lib/profile-events";
import { emptyProfile } from "@/lib/profile-schema";

const AT = "2026-07-25T00:00:00.000Z";

describe("profileEditEvent", () => {
  it("maps a correction to a high-weight append-only row", () => {
    expect(profileEditEvent({ op: "correct", field: "headline", to: "Staff PM" })).toEqual({
      kind: "profile",
      subject_ref: "headline",
      action: "correct",
      payload: { field: "headline", to: "Staff PM" },
      weight: 3,
    });
  });

  it("maps a skill rejection", () => {
    expect(profileEditEvent({ op: "reject", field: "skill", value: "PHP" })).toMatchObject({
      kind: "profile",
      subject_ref: "skill:PHP",
      action: "reject",
      weight: 3,
    });
  });
});

describe("applyProfileEdit", () => {
  it("sets identity facts as source 'user' with full confidence", () => {
    const p = applyProfileEdit(emptyProfile(), { op: "correct", field: "headline", to: "Staff AI PM" }, AT);
    expect(p.identity.headline).toEqual({ value: "Staff AI PM", source: "user", confidence: 1, at: AT });
  });

  it("writes nested target fields without clobbering the rest", () => {
    let p = applyProfileEdit(emptyProfile(), { op: "correct", field: "target.role", to: "Senior PM" }, AT);
    p = applyProfileEdit(p, { op: "correct", field: "target.comp", to: "$220k" }, AT);
    expect(p.signals.target).toMatchObject({ role: "Senior PM", comp: "$220k", cares_about: [] });
  });

  it("removes a rejected skill (case-insensitive) and leaves others", () => {
    const base = emptyProfile();
    base.skills = [
      { canonical: "Python", source: "github", confidence: 0.9 },
      { canonical: "PHP", source: "resume", confidence: 0.5 },
    ];
    const p = applyProfileEdit(base, { op: "reject", field: "skill", value: "php" }, AT);
    expect(p.skills.map((s) => s.canonical)).toEqual(["Python"]);
  });

  it("does not mutate the input profile", () => {
    const base = emptyProfile();
    applyProfileEdit(base, { op: "correct", field: "name", to: "X" }, AT);
    expect(base.identity.name).toBeUndefined();
  });
});
