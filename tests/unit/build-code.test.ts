import { describe, it, expect } from "vitest";
import buildCode from "@/agent/skills/build/build_code";
import { parsePrototypeOutput } from "@/lib/sandbox";

/**
 * build_code emits a DELIMITED format (@@META + @@FILE blocks), parsed by
 * parsePrototypeOutput. These lock the parser + the skill's shape gate (a real
 * prototype must have app source, not just the harness). Pure, network-free.
 */
const ok = [
  '@@META {"name":"spend-coach","summary":"Catches overspend before it happens.","entry":"src/main.jsx","walkthrough":["Click a category"]}',
  "@@FILE package.json",
  '{"name":"spend-coach"}',
  "@@FILE index.html",
  "<!doctype html>",
  "@@FILE src/main.jsx",
  "import {createRoot} from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render('hi');",
  "@@END",
].join("\n");

describe("parsePrototypeOutput", () => {
  it("parses meta + raw file blocks (no JSON escaping of code)", () => {
    const g = parsePrototypeOutput(ok)!;
    expect(g.name).toBe("spend-coach");
    expect(g.walkthrough).toEqual(["Click a category"]);
    expect(g.files.map((f) => f.path)).toEqual(["package.json", "index.html", "src/main.jsx"]);
    // raw code survived intact, including the newline
    expect(g.files.find((f) => f.path === "src/main.jsx")!.content).toContain("createRoot(document");
  });

  it("tolerates a missing @@META and a missing @@END", () => {
    const g = parsePrototypeOutput("@@FILE src/main.jsx\nconst x = 1;\n")!;
    expect(g.files).toHaveLength(1);
    expect(g.files[0].content.trim()).toBe("const x = 1;");
  });

  it("strips an accidental ``` fence around a file", () => {
    const g = parsePrototypeOutput("@@FILE src/main.jsx\n```jsx\nconst x = 1;\n```\n")!;
    expect(g.files[0].content.trim()).toBe("const x = 1;");
  });

  it("returns null when no files were produced", () => {
    expect(parsePrototypeOutput("just prose, no markers")).toBeNull();
  });
});

describe("build_code · shape gate", () => {
  it("accepts output with real app source", () => {
    expect(buildCode.expects!(ok)).toBe(true);
  });

  it("rejects harness-only output (no src/ file)", () => {
    const bad = "@@FILE package.json\n{}\n@@END";
    expect(buildCode.expects!(bad)).toBe(false);
  });

  it("rejects a truncated/unparseable response", () => {
    expect(buildCode.expects!("@@META {\"name\":\"x\"")).toBe(false);
  });
});
