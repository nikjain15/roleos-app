import { describe, it, expect } from "vitest";
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
