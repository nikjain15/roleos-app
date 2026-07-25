import { describe, it, expect } from "vitest";
import { isPlainEnglish, offendingTerms } from "@/lib/jargon";

describe("ticker jargon guard", () => {
  it("passes the real ticker lines (plain English)", () => {
    const shipped = [
      "Reading what you sent…",
      "Pulling your profile from that link…",
      "Comparing you against every open role…",
      "Reading you back, and reasoning about the closest fits…",
    ];
    for (const line of shipped) {
      expect(isPlainEnglish(line), `"${line}" should be plain English`).toBe(true);
    }
  });

  it("flags implementation jargon", () => {
    expect(isPlainEnglish("Running embeddings and rerank…")).toBe(false);
    expect(isPlainEnglish("Computing cosine similarity in pgvector…")).toBe(false);
    expect(isPlainEnglish("Calling the LLM endpoint…")).toBe(false);
    expect(offendingTerms("Running embeddings…")).toContain("embeddings");
  });

  it("uses whole-word matching (no substring false positives)", () => {
    // "reindexed" contains "index" but is not the standalone term
    expect(isPlainEnglish("Your list reshuffled instantly")).toBe(true);
    // "token" as a word is blocked; inside another word it is not
    expect(offendingTerms("a broken promise")).toEqual([]);
  });
});
