import { describe, it, expect } from "vitest";
import { toVerdict, locationText, filterRoles, sortRoles, curate, type WorkspaceRole } from "@/lib/workspace";

const row = (over: Partial<WorkspaceRole>): WorkspaceRole => ({
  role_id: "r", fit: 50, verdict: "maybe", company: "Acme", title: "PM", location: "NYC",
  remote: false, url: null, why: null, gaps: [], status: "new", created_at: "2026-07-01", ...over,
});

describe("toVerdict", () => {
  it("normalizes recommendation strings", () => {
    expect(toVerdict("pursue")).toBe("pursue");
    expect(toVerdict("Maybe — worth a look")).toBe("maybe");
    expect(toVerdict("skip")).toBe("skip");
    expect(toVerdict(null)).toBe("unknown");
  });
});

describe("locationText", () => {
  it("flattens string and object locations + detects remote", () => {
    expect(locationText("Remote US")).toEqual({ text: "Remote US", remote: true });
    expect(locationText({ city: "NYC", country: "US" }).text).toBe("NYC, US");
    expect(locationText({ remote: true }).remote).toBe(true);
    expect(locationText(null)).toEqual({ text: null, remote: false });
  });
});

describe("filterRoles", () => {
  const rows = [
    row({ role_id: "a", verdict: "pursue", company: "Stripe", location: "Remote", remote: true }),
    row({ role_id: "b", verdict: "skip", company: "Acme", location: "NYC" }),
    row({ role_id: "c", verdict: "pursue", company: "Ramp", status: "dismissed" }),
  ];

  it("always hides dismissed roles", () => {
    expect(filterRoles(rows, {}).map((r) => r.role_id)).toEqual(["a", "b"]);
  });
  it("filters by verdict, company, remote (AND)", () => {
    expect(filterRoles(rows, { verdict: "pursue" }).map((r) => r.role_id)).toEqual(["a"]);
    expect(filterRoles(rows, { company: "acme" }).map((r) => r.role_id)).toEqual(["b"]);
    expect(filterRoles(rows, { remoteOnly: true }).map((r) => r.role_id)).toEqual(["a"]);
  });
  it("empty result is just an empty array (honest empty state)", () => {
    expect(filterRoles(rows, { company: "nope" })).toEqual([]);
  });
});

describe("sortRoles", () => {
  const rows = [
    row({ role_id: "lo", fit: 30, verdict: "skip", created_at: "2026-07-03" }),
    row({ role_id: "hi", fit: 90, verdict: "pursue", created_at: "2026-07-01" }),
  ];
  it("sorts by fit desc", () => {
    expect(sortRoles(rows, "fit").map((r) => r.role_id)).toEqual(["hi", "lo"]);
  });
  it("sorts by recency desc", () => {
    expect(sortRoles(rows, "recency").map((r) => r.role_id)).toEqual(["lo", "hi"]);
  });
  it("sorts by verdict then fit", () => {
    expect(sortRoles(rows, "verdict").map((r) => r.role_id)).toEqual(["hi", "lo"]);
  });
});

describe("curate", () => {
  it("filters then sorts in one pass", () => {
    const rows = [
      row({ role_id: "a", fit: 40, verdict: "pursue" }),
      row({ role_id: "b", fit: 80, verdict: "pursue" }),
      row({ role_id: "c", fit: 99, verdict: "skip" }),
    ];
    expect(curate(rows, "fit", { verdict: "pursue" }).map((r) => r.role_id)).toEqual(["b", "a"]);
  });
});
