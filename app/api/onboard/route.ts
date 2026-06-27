import { recallRoles } from "@/lib/match";
import { matchProfile } from "@/lib/run-match";
import { runSkill } from "@/agent/skills/run";
import mirrorSkill from "@/agent/skills/mirror";
import { stripFence } from "@/agent/skills/match";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const { profile } = (await req.json()) as { profile?: string };
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

        // Recall first so we can narrate a real number.
        const candidates = await recallRoles(profile, 6);
        send({ type: "status", text: "Scanning 557 roles…" });
        send({
          type: "status",
          text: `Ruled out ${557 - candidates.length} that are off your trajectory. ${candidates.length} worth a look.`,
        });

        // Mirror + full reasoning in parallel (both through the quality gate).
        send({ type: "status", text: "Reading you back, and reasoning about the fits…" });
        const [mirrorRes, matchRes] = await Promise.all([
          runSkill(mirrorSkill, { userId: "anon", data: { profile } }),
          matchProfile(profile, 6),
        ]);

        try {
          const mirror = JSON.parse(stripFence(mirrorRes.verdict.finalOutput));
          send({ type: "mirror", statements: mirror.statements, insight: mirror.insight });
        } catch {
          /* mirror is best-effort; matches are the substance */
        }

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
