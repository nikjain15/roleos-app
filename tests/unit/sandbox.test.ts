import { describe, it, expect } from "vitest";
import { normalizeProject } from "@/lib/sandbox";

/**
 * normalizeProject guards the sandbox contract: whatever RO generates, the
 * project must be servable — exact dev script + port, the core deps present, and
 * a vite config + index.html available. Pure, network-free.
 */
function pkgOf(files: { path: string; content: string }[]) {
  return JSON.parse(files.find((f) => f.path === "package.json")!.content);
}

describe("normalizeProject · sandbox contract", () => {
  it("forces the exact dev script + port the sandbox exposes", () => {
    const out = normalizeProject([
      { path: "package.json", content: JSON.stringify({ scripts: { dev: "vite" } }) },
    ]);
    expect(pkgOf(out).scripts.dev).toBe("vite --host 0.0.0.0 --port 8080");
  });

  it("synthesizes a package.json when the model omitted one", () => {
    const out = normalizeProject([{ path: "src/main.jsx", content: "x" }]);
    const pkg = pkgOf(out);
    expect(pkg.scripts.dev).toBe("vite --host 0.0.0.0 --port 8080");
    expect(pkg.dependencies.react).toBeTruthy();
    expect(pkg.devDependencies.vite).toBeTruthy();
  });

  it("backfills vite config + index.html only when missing", () => {
    const out = normalizeProject([
      { path: "package.json", content: "{}" },
      { path: "index.html", content: "<!-- mine -->" },
    ]);
    expect(out.find((f) => f.path === "vite.config.js")).toBeTruthy();
    // does not clobber an existing index.html
    expect(out.find((f) => f.path === "index.html")!.content).toBe("<!-- mine -->");
  });

  it("keeps the model's own deps while guaranteeing the core ones", () => {
    const out = normalizeProject([
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { react: "^18.0.0" } }),
      },
    ]);
    const pkg = pkgOf(out);
    // model's pin wins; core deps still all present
    expect(pkg.dependencies.react).toBe("^18.0.0");
    expect(pkg.dependencies["react-dom"]).toBeTruthy();
    expect(pkg.private).toBe(true);
  });
});
