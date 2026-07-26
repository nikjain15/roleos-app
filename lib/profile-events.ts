/**
 * Profile corrections → decision_events + the pure edit-application (P2,
 * docs/specs/profile-data-layer.md). When the user fixes what RO knows about them
 * ("that's not my title", "drop this skill", "here's my real target"), that's the
 * single highest-signal taste input there is — an explicit, deliberate correction.
 * It lands at HIGH weight so the taste model trusts it over any passive inference,
 * and it updates the stored canonical profile in place (source "user", full
 * confidence — the user is authoritative about themselves).
 *
 * Pure + deterministic. The route scopes the event to auth.uid() and persists.
 */

import type { DecisionEventRow } from "@/lib/onboarding-events";
import type { CanonicalProfile } from "@/lib/profile-schema";

const W = 3; // an explicit fix outranks inference (== onboarding correction weight)

// Bounded, safe editable surface (no free-form path writes into stored JSON).
export type EditableField =
  | "name"
  | "headline"
  | "location"
  | "seniority"
  | "target.role"
  | "target.level"
  | "target.comp"
  | "target.location";

export type ProfileEdit =
  | { op: "correct"; field: EditableField; to: string }
  | { op: "reject"; field: "skill"; value: string }; // "this skill isn't me" → remove

/** Map a single profile edit → an append-only decision_events row. */
export function profileEditEvent(edit: ProfileEdit): DecisionEventRow {
  if (edit.op === "reject") {
    return { kind: "profile", subject_ref: `skill:${edit.value}`, action: "reject", payload: { field: "skill", value: edit.value }, weight: W };
  }
  return { kind: "profile", subject_ref: edit.field, action: "correct", payload: { field: edit.field, to: edit.to }, weight: W };
}

/** Apply an edit to the canonical profile (pure). User edits are source "user", conf 1. */
export function applyProfileEdit(profile: CanonicalProfile, edit: ProfileEdit, at: string): CanonicalProfile {
  const p: CanonicalProfile = structuredClone(profile);

  if (edit.op === "reject") {
    const v = edit.value.trim().toLowerCase();
    p.skills = p.skills.filter((s) => s.canonical.trim().toLowerCase() !== v);
    return p;
  }

  const to = edit.to.trim();
  const userFact = { value: to, source: "user" as const, confidence: 1, at };
  switch (edit.field) {
    case "name":
      p.identity.name = userFact;
      break;
    case "headline":
      p.identity.headline = userFact;
      break;
    case "location":
      p.identity.location = userFact;
      break;
    case "seniority":
      p.signals.seniority = to;
      break;
    case "target.role":
    case "target.level":
    case "target.comp":
    case "target.location": {
      const key = edit.field.split(".")[1] as "role" | "level" | "comp" | "location";
      p.signals.target = { cares_about: [], ...(p.signals.target ?? {}), [key]: to };
      break;
    }
  }
  return p;
}
