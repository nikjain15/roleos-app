import { matchProfile } from "@/lib/run-match";
import { runSkill } from "@/agent/skills/run";
import mirrorSkill from "@/agent/skills/mirror";
import distillProfile from "@/agent/skills/distill_profile";
import { parseModelJson } from "@/lib/json";
import { assessProfileInput, thinInputMessage } from "@/lib/profile-input";
import { normalizeProfileText } from "@/lib/normalize-profile";
import { extractLinkedInUrl, getProfileFetcher } from "@/lib/profile-fetcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Distill (Haiku) only for genuinely long/redundant profiles. MEASURED:
 *  - ~1.5k-char clean profile → 6% smaller, NET NEGATIVE (Haiku call + latency
 *    costs more than the ~50 Opus input tokens it saves);
 *  - ~4k-char redundant CV → 50% smaller, net-positive + a cleaner signal.
 * Normalization already captures the free win, so distill earns its place only
 * above this size. Below it, skip — not worth the call/latency.
 */
const DISTILL_OVER_CHARS = 3500;

/**
 * Onboarding (journey.html §3 A→B→C): POST { profile } → STREAM RO working.
 * The "wow": RO narrates as she scans 557 roles, then delivers the mirror (reads
 * you back + one insight) and your matches with her reasoning. SSE.
 *
 * Privacy (architecture.md §3.2): nothing persists pre-signup. This route reads
 * global role data only and returns RO's work in the response — it saves nothing.
 * No send capability (human-gated-outward holds).
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { profile?: string };
  // Keep the RAW input through the gate + assess + URL-detection (normalizing
  // here would strip a URL-only input to empty). Noise-stripping happens later,
  // on the actual content we match on (real paste or a fetched profile).
  const profile = body.profile;
  if (!profile || profile.trim().length < 30) {
    return Response.json(
      { error: "Give RO a bit more to go on — paste your CV, LinkedIn, or a few lines about your work." },
      { status: 400 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        send({ type: "status", text: "Reading what you sent…" });

        // Honesty guard (ro-voice "thin input"): a bare URL / too-little text has
        // no real signal to match on. Don't fabricate a shortlist off noise.
        let profileText = profile;
        const assess = assessProfileInput(profileText);
        if (!assess.ok) {
          // If it's a LinkedIn URL AND a scraper is configured, try to fetch the
          // real profile; otherwise stay honest and ask for real content.
          const url = extractLinkedInUrl(profileText);
          const fetcher = url ? getProfileFetcher() : null;
          if (url && fetcher) {
            try {
              send({ type: "status", text: "Pulling your profile from that link…" });
              const fetched = await fetcher.fetchProfileText(url);
              if (assessProfileInput(fetched).ok) {
                profileText = fetched;
              } else {
                send({ type: "needs_more", text: thinInputMessage(assess) });
                send({ type: "done" });
                return;
              }
            } catch {
              send({ type: "needs_more", text: thinInputMessage(assess) });
              send({ type: "done" });
              return;
            }
          } else {
            send({ type: "needs_more", text: thinInputMessage(assess) });
            send({ type: "done" });
            return;
          }
        }

        // Strip extraction/boilerplate noise now — on the real content we match
        // on (the paste or the fetched profile) — for fewer tokens, same signal.
        profileText = normalizeProfileText(profileText);

        // For LONG profiles, a cheap Haiku pass distills to a compact, faithful
        // structured form before the expensive Opus calls (fewer input tokens,
        // same facts). Short pastes skip it — not worth the extra call/latency.
        if (profileText.length > DISTILL_OVER_CHARS) {
          try {
            const before = profileText.length;
            const d = await runSkill(distillProfile, { userId: "anon", data: { profile: profileText } });
            const distilled = d.verdict.finalOutput.trim();
            // Safety: only adopt it if it's non-trivial AND actually smaller.
            if (distilled.length > 100 && distilled.length < before) {
              profileText = distilled;
            }
          } catch {
            /* distillation is an optimization — fall back to the normalized text */
          }
        }

        // Mirror + full matching in parallel (both through the quality gate).
        // matchProfile = rank all 557 by similarity → reason over the closest.
        send({ type: "status", text: "Comparing you against all 557 roles…" });
        send({ type: "status", text: "Reading you back, and reasoning about the closest fits…" });
        const [mirrorRes, matchRes] = await Promise.all([
          runSkill(mirrorSkill, { userId: "anon", data: { profile: profileText } }),
          matchProfile(profileText, 6),
        ]);

        const mirror = parseModelJson<{ statements: string[]; insight: string }>(
          mirrorRes.verdict.finalOutput,
        );
        if (mirror) send({ type: "mirror", statements: mirror.statements, insight: mirror.insight });

        // Slim payload — the UI needs RO's reasoning, not the raw JD JSON.
        const slim = matchRes.matches.map((m) => ({
          id: m.id,
          company: m.company,
          role_title: m.role_title,
          url: m.url,
          comp: m.comp,
          fit: m.fit,
          recommendation: m.recommendation,
          why: m.why,
          gaps: m.gaps,
        }));
        send({ type: "matches", matches: slim, scanned: matchRes.scanned });
        send({ type: "done" });
      } catch (e) {
        send({
          type: "error",
          text: "That didn't go through on my end — not you. Try again in a moment.",
          detail: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
