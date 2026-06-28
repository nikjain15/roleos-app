import { describe, it, expect } from "vitest";
import classifyRecruiter from "@/agent/skills/gate2/classify_recruiter";
import screeningAnswer from "@/agent/skills/gate2/screening_answer";
import recruiterReply from "@/agent/skills/gate2/recruiter_reply";

describe("gate 2 skills · shape + config", () => {
  it("classify_recruiter is shape-only (Haiku, not RO's voice) and validates JSON", () => {
    expect(classifyRecruiter.model).toBe("quick_tag");
    expect(classifyRecruiter.gate).toBe("shape_only");
    expect(classifyRecruiter.expects!('{"category":"screening","needs_reply":true}')).toBe(true);
    expect(classifyRecruiter.expects!("not json")).toBe(false);
  });

  it("screening_answer runs the full gate (truth-gated) and needs a non-empty answer", () => {
    expect(screeningAnswer.gate).toBe("full");
    expect(screeningAnswer.structured).toBe(true);
    expect(screeningAnswer.expects!('{"answer":"I led a 0-to-1 launch…","evidence":[]}')).toBe(true);
    expect(screeningAnswer.expects!('{"answer":""}')).toBe(false);
  });

  it("recruiter_reply drafts (you-send) and needs a reply body — no send tool", () => {
    expect(recruiterReply.tools).toEqual([]);
    expect(recruiterReply.expects!('{"subject":"Re: chat","reply":"Thanks for reaching out…"}')).toBe(true);
    expect(recruiterReply.expects!('{"reply":""}')).toBe(false);
  });
});
