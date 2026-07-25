import { runSkill } from "@/agent/skills/run";
import structureResumeSkill from "@/agent/skills/structure_resume";
import { parseModelJson } from "@/lib/json";
import { linkedinToProfile, githubToProfile, mergeProfiles, type LinkedInStructured } from "@/lib/profile-map";
import { parseCanonicalProfile, type CanonicalProfile } from "@/lib/profile-schema";
import type { GitHubStructured } from "@/lib/github-fetch";

/**
 * Build the canonical profile from all resolved sources (docs/specs/profile-data-
 * layer.md, Layer 1, hybrid). Deterministic mappers for the structured sources
 * (LinkedIn/GitHub — high confidence, no model), an LLM structurer for the one
 * messy source (résumé/free text), then merge/reconcile. Best-effort per source:
 * any failing source is skipped, never fatal.
 */
export async function structureProfile(opts: {
  linkedin?: LinkedInStructured | null;
  github?: GitHubStructured | null;
  resumeText?: string;
  target?: string;
  at: string;
}): Promise<CanonicalProfile> {
  const profiles: CanonicalProfile[] = [];

  if (opts.linkedin) {
    try {
      profiles.push(linkedinToProfile(opts.linkedin, opts.at));
    } catch {
      /* skip a malformed source */
    }
  }
  if (opts.github) {
    try {
      profiles.push(githubToProfile(opts.github.user, opts.github.repos, opts.at));
    } catch {
      /* skip */
    }
  }

  const resume = opts.resumeText?.trim();
  if (resume && resume.length >= 40) {
    try {
      const { verdict } = await runSkill(structureResumeSkill, { userId: "anon", data: { profile: resume } });
      const json = parseModelJson<unknown>(verdict.finalOutput);
      if (json) profiles.push(parseCanonicalProfile(json, { defaultSource: "resume", at: opts.at }));
    } catch {
      /* the résumé structurer is best-effort — the structured sources still deliver */
    }
  }

  const merged = mergeProfiles(profiles);

  // The S1 target ("what job do you want next?") is the user's own words — highest
  // authority for intent. Seed signals.target so it's captured with the profile.
  const target = opts.target?.trim();
  if (target && !merged.signals.target) {
    merged.signals.target = { role: target, cares_about: [] };
  }

  return merged;
}
