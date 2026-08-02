import { recallAndShortlist, reasonShortlist } from "@/lib/run-match";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { runSkill } from "@/agent/skills/run";
import mirrorSkill from "@/agent/skills/mirror";
import distillProfile from "@/agent/skills/distill_profile";
import { parseModelJson } from "@/lib/json";
import { assessProfileInput, thinInputMessage } from "@/lib/profile-input";
import { normalizeProfileText } from "@/lib/normalize-profile";
import { extractLinkedInUrl, getProfileFetcher } from "@/lib/profile-fetcher";
import { extractGitHubUrl, fetchGitHubStructured, githubStructuredToText } from "@/lib/github-fetch";
import { structureProfile } from "@/lib/profile-structure";

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
 * Privacy (architecture.md §3.2, docs/PRIVACY.md): no PROFILE data persists
 * pre-signup. This route reads global role data only and returns RO's work in the
 * response; it writes no profile, match, or artifact row. Two operational rows are
 * still written on every run and the notice says so: a `rate_events` row keyed by
 * the caller's IP (the limiter below) and one `agent_runs` cost row per model call
 * (token counts and money only, never prompt text). The profile text itself is
 * sent to Anthropic, and to the scraper if a LinkedIn URL is supplied and a key is
 * configured. No send capability (human-gated-outward holds).
 */
export async function POST(req: Request): Promise<Response> {
  // H3: the most expensive PUBLIC path (full matching pipeline) — per-IP limit.
  const rate = await checkRateLimit("onboard", clientIp(req));
  if (!rate.allowed) {
    return rateLimitResponse("You've run onboarding a few times this hour — give it a rest and try again soon.");
  }


  const body = (await req.json().catch(() => ({}))) as { profile?: string; target?: string };
  if (typeof body.profile === "string" && body.profile.length > 200_000) {
    return Response.json({ error: "that's too much text — trim it to the CV itself" }, { status: 400 });
  }
  // Optional S1 target ("What job do you want next?") — biases recall so the
  // shortlist reflects what they told us, not just their history (PRD §4).
  const target = typeof body.target === "string" ? body.target.trim().slice(0, 500) : "";
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

        // Pull the URLs RO can read FOR you (a bare URL isn't useful content — the
        // fetched profile is), then combine with whatever free text is left. All
        // sources COMBINE; none is discarded. LinkedIn needs a configured scraper;
        // GitHub is the free, ToS-clean public API.
        const linkedinUrl = extractLinkedInUrl(profile);
        const githubUrl = extractGitHubUrl(profile);
        const linkedinFetcher = linkedinUrl ? getProfileFetcher() : null;
        if (linkedinUrl && linkedinFetcher) send({ type: "status", text: "Pulling your profile from that link…" });
        if (githubUrl) send({ type: "status", text: "Reading your GitHub…" });

        // One structured fetch per source → derive BOTH the matching text and the
        // canonical profile (no second paid scrape).
        const [linkedinRes, githubStruct] = await Promise.all([
          linkedinUrl && linkedinFetcher
            ? linkedinFetcher.fetchProfile(linkedinUrl).catch(() => null)
            : Promise.resolve(null),
          githubUrl ? fetchGitHubStructured(githubUrl).catch(() => null) : Promise.resolve(null),
        ]);
        const linkedinText = linkedinRes?.text ?? "";
        const githubText = githubStruct ? githubStructuredToText(githubStruct) : "";

        // Free text = what the user typed BEYOND the URLs (notes / pasted CV). Strip
        // both URL forms (scheme or not) so the raw link doesn't pollute the signal.
        const freeText = profile
          .replace(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[^\s?#]+/gi, " ")
          .replace(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9][A-Za-z0-9-]*(?:\/[^\s?#]*)?/gi, " ")
          .trim();

        // Combine every source RO was given. If nothing has real signal, stay honest.
        let profileText = [linkedinText, githubText, freeText].filter((s) => s.trim().length > 0).join("\n\n");
        if (!assessProfileInput(profileText).ok) {
          send({ type: "needs_more", text: thinInputMessage(assessProfileInput(profile)) });
          send({ type: "done" });
          return;
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

        // Emit the RESOLVED profile (fetched + normalized) so the client saves
        // the real content as the master_profile — not the URL the user typed.
        // Without this, downstream gates (résumé truth-gate, screening) have no
        // verifiable source of truth and correctly refuse to work.
        send({ type: "resolved", profile: profileText });

        // Everything runs in parallel and streams the MOMENT each piece is ready
        // (quality-first, latency-hidden — no model tier is cut):
        //  · the mirror emits as soon as RO's read is done (~30–40s);
        //  · matching is staged — recall+coarse-rank paints skeleton job cards
        //    fast, then the expensive per-role reasoning upgrades them in place.
        // So the jobs column fills early instead of sitting blank for ~2min.
        const N_JOBS = 6;
        send({ type: "status", text: "Reading you back…" });

        // Mirror streams independently — don't block the jobs pipeline on it.
        const mirrorPromise = (async () => {
          try {
            const mirrorRes = await runSkill(mirrorSkill, { userId: "anon", data: { profile: profileText } });
            const mirror = parseModelJson<{ statements: { lead: string; detail: string }[]; insight: string }>(mirrorRes.verdict.finalOutput);
            if (mirror) send({ type: "mirror", statements: mirror.statements, insight: mirror.insight });
          } catch {
            /* mirror is best-effort — matches still deliver value */
          }
        })();

        // Build the canonical structured profile in parallel (docs/specs/profile-
        // data-layer.md): deterministic LinkedIn/GitHub mappers + résumé structurer
        // + merge. Rides alongside matching; emitted for the client to persist on
        // save. The one model call (résumé structurer) only fires if there's free
        // text — a LinkedIn/GitHub-only input maps deterministically, no added call.
        const canonicalPromise = structureProfile({
          linkedin: linkedinRes?.structured ?? null,
          github: githubStruct,
          resumeText: freeText,
          target: target || undefined,
          at: new Date().toISOString(),
        })
          .then((canonical) => {
            send({ type: "profile_canonical", profile: canonical });
            return canonical;
          })
          .catch(() => null);

        send({ type: "status", text: "Comparing you against every open role…" });
        const { short, scanned } = await recallAndShortlist(profileText, N_JOBS, target ? [target] : []);

        // Skeleton cards — real roles (company/title/comp) the instant recall is
        // done, so the column fills while RO reasons each one through.
        send({
          type: "shortlist",
          scanned,
          roles: short.map((c) => ({
            id: c.id,
            company: c.company,
            role_title: c.role_title,
            url: c.url,
            comp: c.comp,
          })),
        });

        send({ type: "status", text: "Weighing each one against you…" });
        const matchRes = await reasonShortlist(profileText, short);

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
        send({ type: "matches", matches: slim, scanned });

        await Promise.all([mirrorPromise, canonicalPromise]); // read + canonical landed
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
