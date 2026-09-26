import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_NAMES, tools } from "@/agent/tools";

/**
 * Invariant (architecture.md §6, layer 3): the agent tool registry contains no
 * send-capable tool. If anyone adds one, this fails the build.
 */
const FORBIDDEN = [
  /send/i,
  /email/i,
  /mail/i,
  /dispatch/i,
  /\bpost\b/i,
  /http/i,
  /fetch/i,
  /submit/i,
  /sms/i,
  /webhook/i,
];

describe("human-gated-outward: no send tool exists", () => {
  it("no tool NAME is send-capable", () => {
    for (const name of TOOL_NAMES) {
      for (const re of FORBIDDEN) {
        expect(re.test(name), `tool "${name}" matches forbidden ${re}`).toBe(false);
      }
    }
  });

  it("no tool DESCRIPTION advertises an outbound action", () => {
    for (const t of Object.values(tools)) {
      for (const re of FORBIDDEN) {
        expect(
          re.test(t.description),
          `tool "${t.name}" description matches forbidden ${re}`,
        ).toBe(false);
      }
    }
  });

  it("registry and exported tools stay in sync", () => {
    expect(Object.keys(tools).sort()).toEqual([...TOOL_NAMES].sort());
  });
});

describe("human-gated-outward: agent source performs no direct transport", () => {
  // dependency-cruiser only sees imports. fetch, XHR and WebSocket are globals
  // and need none, so scan the source too. Model calls go through the SDK.
  const OUTBOUND = /\bfetch\s*\(|XMLHttpRequest|new WebSocket\b|navigator\.sendBeacon/;
  const agentDir = fileURLToPath(new URL("../../agent", import.meta.url));

  it("no file under agent/ calls fetch, XHR, WebSocket or sendBeacon", () => {
    const files = readdirSync(agentDir, { recursive: true, encoding: "utf8" }).filter(
      (f) => /\.(ts|tsx|js|mjs)$/.test(f),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(agentDir, f), "utf8");
      expect(OUTBOUND.test(src), `agent/${f} performs direct transport`).toBe(false);
    }
  });
});
