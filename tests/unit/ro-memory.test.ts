import { describe, it, expect } from "vitest";
import { deriveNotes, newNotes, type DerivableEvent, type RoNoteDraft } from "@/lib/ro/memory";

/**
 * M1 — the notebook's PURE derivation: real actions (decision_events) → typed
 * notes, each traceable to an event, deduped (repeats harden, never duplicate),
 * never invented.
 */

describe("deriveNotes", () => {
  it("turns profile corrections into target/identity notes", () => {
    const events: DerivableEvent[] = [
      { id: "e1", kind: "profile", action: "correct", payload: { field: "target.role", to: "Staff AI PM" } },
      { id: "e2", kind: "profile", action: "correct", payload: { field: "headline", to: "AI PM · agents" } },
      { id: "e3", kind: "profile", action: "correct", payload: { field: "seniority", to: "senior" } },
    ];
    const notes = deriveNotes(events);
    expect(notes).toEqual(
      expect.arrayContaining([
        { scope: "global", kind: "target", text: "Targets Staff AI PM", confidence: 0.9, sourceEventId: "e1" },
        { scope: "global", kind: "identity", text: "Positions as: AI PM · agents", confidence: 0.85, sourceEventId: "e2" },
        { scope: "global", kind: "identity", text: "Seniority: senior", confidence: 0.85, sourceEventId: "e3" },
      ]),
    );
  });

  it("records a rejected skill as a correction RO shouldn't re-suggest", () => {
    const notes = deriveNotes([{ id: "e", kind: "profile", action: "reject", payload: { field: "skill", value: "PHP" } }]);
    expect(notes).toEqual([{ scope: "global", kind: "correction", text: "Not their skill: PHP", confidence: 0.9, sourceEventId: "e" }]);
  });

  it("turns a résumé tune into a scoped style note", () => {
    const notes = deriveNotes([
      { id: "e", kind: "resume", action: "edit", payload: { signal: "tune", instruction: "make the founder years pop", artifactId: "a1" } },
    ]);
    expect(notes[0]).toMatchObject({ scope: "artifact:a1", kind: "style", confidence: 0.6, sourceEventId: "e" });
    expect(notes[0].text).toContain("make the founder years pop");
  });

  it("dedupes by text — a repeated note keeps the highest confidence, once", () => {
    const notes = deriveNotes([
      { id: "a", kind: "profile", action: "correct", payload: { field: "target.role", to: "Staff AI PM" } },
      { id: "b", kind: "profile", action: "correct", payload: { field: "target.role", to: "Staff AI PM" } },
    ]);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("Targets Staff AI PM");
  });

  it("ignores events it can't ground (no payload, unknown kinds)", () => {
    expect(
      deriveNotes([
        { kind: "profile", action: "correct", payload: {} },
        { kind: "mirror", action: "view", payload: { x: 1 } },
        { kind: "resume", action: "approve", payload: { signal: "lock" } },
      ]),
    ).toEqual([]);
  });
});

describe("newNotes — idempotency filter (no duplicates across syncs)", () => {
  const d = (text: string): RoNoteDraft => ({ scope: "global", kind: "target", text, confidence: 0.9 });

  it("drops drafts whose text is already stored (case-insensitive)", () => {
    const fresh = newNotes([d("Targets Staff AI PM"), d("Prefers remote")], ["targets staff ai pm"]);
    expect(fresh.map((n) => n.text)).toEqual(["Prefers remote"]);
  });

  it("dedupes within the same batch too", () => {
    expect(newNotes([d("Prefers remote"), d("prefers remote")], [])).toHaveLength(1);
  });

  it("returns all when nothing is stored yet", () => {
    expect(newNotes([d("a"), d("b")], [])).toHaveLength(2);
  });
});
