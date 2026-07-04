import { describe, it, expect } from "vitest";
import { buildFilterHref, parseWorkspaceParams, validateAct } from "@/lib/dock-acts";

/**
 * Slice W3 — RO-dock act-verbs. The server must never trust a model-proposed
 * act: tailor roleIds are checked against the user's OWN candidate set, filter
 * params are whitelisted into a sanitized /roles?… href.
 */
const MY_ROLES = [
  { id: "11111111-1111-1111-1111-111111111111", company: "Acme", title: "Staff PM" },
  { id: "22222222-2222-2222-2222-222222222222", company: "Beta", title: "Senior PM" },
];

describe("validateAct — tailor", () => {
  it("accepts a tailor act naming one of the user's own roles, labelled from OUR data", () => {
    const act = validateAct({ kind: "tailor", roleId: MY_ROLES[0].id, label: "IGNORE ME <script>" }, MY_ROLES);
    expect(act).toEqual({
      kind: "tailor",
      roleId: MY_ROLES[0].id,
      label: "Tailor my résumé — Staff PM at Acme",
    });
  });

  it("drops a tailor act naming a role outside the user's own set (injection guard)", () => {
    expect(validateAct({ kind: "tailor", roleId: "99999999-9999-9999-9999-999999999999" }, MY_ROLES)).toBeNull();
    expect(validateAct({ kind: "tailor", roleId: MY_ROLES[0].id }, [])).toBeNull();
    expect(validateAct({ kind: "tailor" }, MY_ROLES)).toBeNull();
  });
});

describe("validateAct — filter", () => {
  it("builds a sanitized /roles href from whitelisted params only", () => {
    const act = validateAct(
      { kind: "filter", verdict: "pursue", remote: true, company: "acme", sort: "fit", label: "Show my pursues" },
      MY_ROLES,
    );
    expect(act?.kind).toBe("filter");
    const href = (act as { href: string }).href;
    expect(href.startsWith("/roles?")).toBe(true);
    expect(href).toContain("verdict=pursue");
    expect(href).toContain("remote=1");
    expect(href).toContain("company=acme");
    expect(href).toContain("sort=fit");
  });

  it("drops bogus verdicts/sorts and truncates free text", () => {
    const href = buildFilterHref({ verdict: "javascript:alert(1)", sort: "DROP TABLE", company: "x".repeat(200) });
    expect(href).not.toContain("verdict");
    expect(href).not.toContain("sort");
    expect(href).toContain(`company=${"x".repeat(60)}`);
  });

  it("unknown kinds and garbage are null", () => {
    expect(validateAct({ kind: "send_email" }, MY_ROLES)).toBeNull();
    expect(validateAct(null, MY_ROLES)).toBeNull();
    expect(validateAct(undefined, MY_ROLES)).toBeNull();
    expect(validateAct("filter" as never, MY_ROLES)).toBeNull();
  });
});

describe("parseWorkspaceParams — the in-place half", () => {
  it("round-trips what buildFilterHref produced", () => {
    const href = buildFilterHref({ verdict: "pursue", remote: true, company: "acme", location: "nyc", sort: "recency" });
    const { filters, sort } = parseWorkspaceParams(new URLSearchParams(href.split("?")[1]));
    expect(filters).toEqual({ verdict: "pursue", company: "acme", location: "nyc", remoteOnly: true });
    expect(sort).toBe("recency");
  });

  it("ignores junk params and leaves untouched fields undefined", () => {
    const { filters, sort } = parseWorkspaceParams(new URLSearchParams("verdict=bogus&sort=nope&remote=2&foo=bar"));
    expect(filters.verdict).toBeUndefined();
    expect(filters.remoteOnly).toBeUndefined();
    expect(filters.company).toBeUndefined();
    expect(sort).toBeNull();
  });
});
