import { describe, it, expect } from "vitest";
import {
  assembleQueue,
  type QueueApp,
  type QueueArtifact,
  type QueueMatch,
  type QueueRole,
} from "@/lib/ready-room";

/**
 * X10 — the ready-room queue assembly, pure. FIFO honesty, hunt-only drafting
 * rows, truth flags blocking one-click approval, and quiet exclusion of
 * anything that isn't reviewable.
 */

const app = (id: string, stage: string, created: string, artIds: string[] | null = null): QueueApp => ({
  id,
  role_id: `role-${id}`,
  stage,
  artifact_ids: artIds,
  created_at: created,
});

const art = (id: string, over: Partial<QueueArtifact> = {}): QueueArtifact => ({
  id,
  role_id: null,
  type: "resume",
  status: "draft",
  content: { summary: "A real summary.", bullets: [{ text: "b1" }, { text: "b2" }, { text: "b3" }, { text: "b4" }] },
  provenance: { gate_status: "passed", truth: { ok: true, violations: [] }, source: "overnight_hunt" },
  ...over,
});

const role = (id: string): QueueRole => ({ id: `role-${id}`, company: `Co-${id}`, role_title: `Role-${id}` });
const match = (id: string): QueueMatch => ({ role_id: `role-${id}`, fit_score: 80, reasoning: { why: "why" } });

function maps(apps: QueueApp[], arts: QueueArtifact[]) {
  return {
    artifacts: new Map(arts.map((a) => [a.id, a])),
    roles: new Map(apps.map((a) => [a.role_id!, role(a.id)])),
    matches: new Map(apps.map((a) => [a.role_id!, match(a.id)])),
  };
}

describe("assembleQueue", () => {
  it("FIFO — oldest first, regardless of input order", () => {
    const apps = [app("new", "ready", "2026-07-04", ["a-new"]), app("old", "ready", "2026-07-01", ["a-old"])];
    const m = maps(apps, [art("a-new"), art("a-old")]);
    const q = assembleQueue(apps, m.artifacts, m.roles, m.matches);
    expect(q.map((c) => c.applicationId)).toEqual(["old", "new"]);
  });

  it("clean draft → approvable; flagged → NOT one-click approvable, flags surfaced", () => {
    const apps = [app("c", "ready", "2026-07-01", ["a-c"]), app("f", "ready", "2026-07-02", ["a-f"])];
    const m = maps(apps, [
      art("a-c"),
      art("a-f", { status: "needs_your_eyes", provenance: { truth: { ok: false, violations: ["invented a metric"] }, source: "overnight_hunt" } }),
    ]);
    const q = assembleQueue(apps, m.artifacts, m.roles, m.matches);
    expect(q[0].approvable).toBe(true);
    expect(q[1].approvable).toBe(false);
    expect(q[1].truthFlags).toEqual(["invented a metric"]);
  });

  it("approved artifact → alreadyApproved (straight to apply); sent → excluded", () => {
    const apps = [app("ap", "ready", "2026-07-01", ["a-ap"]), app("st", "ready", "2026-07-02", ["a-st"])];
    const m = maps(apps, [art("a-ap", { status: "approved" }), art("a-st", { status: "sent" })]);
    const q = assembleQueue(apps, m.artifacts, m.roles, m.matches);
    expect(q).toHaveLength(1);
    expect(q[0].alreadyApproved).toBe(true);
  });

  it("drafting rows join ONLY when the artifact is the hunt's — manual drafts stay in the studio", () => {
    const apps = [app("h", "drafting", "2026-07-01", ["a-h"]), app("m", "drafting", "2026-07-02", ["a-m"])];
    const m = maps(apps, [
      art("a-h", { status: "needs_your_eyes", provenance: { truth: { ok: false, violations: ["x"] }, source: "overnight_hunt" } }),
      art("a-m", { provenance: { truth: { ok: true, violations: [] } } }), // no hunt source
    ]);
    const q = assembleQueue(apps, m.artifacts, m.roles, m.matches);
    expect(q.map((c) => c.applicationId)).toEqual(["h"]);
  });

  it("quietly excludes the unreviewable: other stages, missing artifact/role, non-resume types", () => {
    const apps = [
      app("applied", "applied", "2026-07-01", ["a-x"]),
      app("noart", "ready", "2026-07-02", null),
      app("norole", "ready", "2026-07-03", ["a-nr"]),
      app("cover", "ready", "2026-07-04", ["a-cv"]),
    ];
    const artifacts = new Map([
      ["a-x", art("a-x")],
      ["a-nr", art("a-nr")],
      ["a-cv", art("a-cv", { type: "cover" })],
    ]);
    const roles = new Map([["role-applied", role("applied")], ["role-noart", role("noart")], ["role-cover", role("cover")]]);
    const q = assembleQueue(apps, artifacts, roles, new Map());
    expect(q).toEqual([]);
  });

  it("caps bullets at 3 and tolerates missing content/match", () => {
    const apps = [app("b", "ready", "2026-07-01", ["a-b"])];
    const m = maps(apps, [art("a-b", { content: null })]);
    const q = assembleQueue(apps, m.artifacts, m.roles, new Map());
    expect(q[0].summary).toBeNull();
    expect(q[0].bullets).toEqual([]);
    expect(q[0].fit).toBeNull();
    const q2 = assembleQueue(apps, maps(apps, [art("a-b")]).artifacts, m.roles, m.matches);
    expect(q2[0].bullets).toHaveLength(3);
  });
});
