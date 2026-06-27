import { describe, it, expect } from "vitest";
import buildCode from "@/agent/skills/build/build_code";

/**
 * The build_code shape gate: the generated prototype must be a non-empty set of
 * complete files including a package.json (the sandbox needs it to run). Pure,
 * network-free — guards the contract the sandbox relies on.
 */
const ok = JSON.stringify({
  name: "spend-coach",
  summary: "A nudge that catches overspend before it happens.",
  entry: "src/main.jsx",
  files: [
    { path: "package.json", content: '{"name":"spend-coach"}' },
    { path: "index.html", content: "<!doctype html>" },
    { path: "src/main.jsx", content: "createRoot..." },
  ],
  walkthrough: ["Click a category to see the projection"],
});

describe("build_code · shape gate", () => {
  it("accepts a complete project with a package.json", () => {
    expect(buildCode.expects!(ok)).toBe(true);
  });

  it("rejects a project missing package.json", () => {
    const bad = JSON.stringify({
      files: [{ path: "src/main.jsx", content: "x" }],
    });
    expect(buildCode.expects!(bad)).toBe(false);
  });

  it("rejects an empty file (incomplete generation)", () => {
    const bad = JSON.stringify({
      files: [
        { path: "package.json", content: "{}" },
        { path: "src/main.jsx", content: "" },
      ],
    });
    expect(buildCode.expects!(bad)).toBe(false);
  });

  it("rejects no files at all", () => {
    expect(buildCode.expects!(JSON.stringify({ files: [] }))).toBe(false);
    expect(buildCode.expects!("not json")).toBe(false);
  });
});
