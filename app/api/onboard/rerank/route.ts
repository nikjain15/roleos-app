import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { matchProfile } from "@/lib/run-match";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Anon re-rank (onboarding S3+4, PRD §4). When the user corrects RO's guess of
 * what they want, the shortlist re-ranks against the REAL target. Honest signal:
 * the corrected target is injected as an extra recall query so it actually moves
 * the list — no theater. Pre-auth, so it persists nothing (privacy §5.1); the
 * correction reaches decision_events only on save. Human-gated-outward untouched.
 */
export async function POST(req: Request): Promise<Response> {
  const rate = await checkRateLimit("onboard", clientIp(req));
  if (!rate.allowed) {
    return rateLimitResponse("You've re-ranked a few times this hour — give it a moment and try again.");
  }

  const parsed = await validateBody(
    req,
    z.object({
      profile: z.string().min(30, "not enough profile to match on").max(200_000),
      target: z.string().min(1, "tell me the role to rank against").max(500),
    }),
  );
  if (!parsed.ok) return parsed.response;
  const { profile, target } = parsed.data;

  try {
    const res = await matchProfile(profile, 8, [target]);
    const slim = res.matches.map((m) => ({
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
    return Response.json({ matches: slim, scanned: res.scanned });
  } catch {
    return Response.json(
      { error: "That re-rank didn't go through on my end — not you. Try again in a moment." },
      { status: 500 },
    );
  }
}
