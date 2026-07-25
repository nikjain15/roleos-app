import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validate";
import { supabaseServer } from "@/lib/supabase/server";
import { onboardingEvents, type OnboardingActions } from "@/lib/onboarding-events";
import { parseCanonicalProfile } from "@/lib/profile-schema";

/**
 * Save what RO found during onboarding, once the user has signed up. Writes are
 * RLS-scoped to auth.uid() via the cookie-bound client — a user can only write
 * their own rows. Privacy (architecture.md §3.2): nothing persisted until here.
 *
 * Persists: master_profile (the raw background + the mirror), matches (RO's
 * reasoning per role), and one append-only decision_event marking the moment.
 */
interface SaveBody {
  profile: string;
  mirror?: { statements: string[]; insight: string };
  /** The LinkedIn URL this came from, if any — stored so RO can re-fetch later. */
  linkedin_url?: string;
  matches?: Array<{
    id: string;
    fit: number;
    recommendation: string;
    why: string;
    gaps: unknown;
  }>;
  /** The canonical structured profile (re-coerced server-side before storage). */
  profile_canonical?: Record<string, unknown> | null;
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = await validateBody(
    req,
    z.object({
      profile: z.string().min(1, "nothing to save").max(200_000),
      mirror: z.unknown().optional(),
      linkedin_url: z.string().max(300).nullable().optional(),
      // The canonical structured profile (docs/specs/profile-data-layer.md). Shape
      // is re-coerced server-side below — client input is never trusted.
      profile_canonical: z.record(z.string(), z.unknown()).nullable().optional(),
      matches: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
      // J1: the pre-save actions (✓/✗ per statement, corrections, target, re-rank)
      // that become the taste model's first decision_events (PRD §5.2).
      onboarding: z
        .object({
          target: z.string().max(500).nullable().optional(),
          reranked: z.boolean().optional(),
          scanned: z.number().int().nonnegative().optional(),
          savedMatches: z.number().int().nonnegative().optional(),
          mirrorReactions: z
            .array(
              z.object({
                statement: z.string().max(2000),
                verdict: z.enum(["confirm", "correct"]),
                correction: z.string().max(2000).optional(),
                isGuess: z.boolean().optional(),
              }),
            )
            .max(40)
            .optional(),
        })
        .optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as unknown as SaveBody & { onboarding?: OnboardingActions };

  // master_profile (projection) — the living source of truth starts here. Store
  // the raw text (re-processable) + the canonical structured profile (re-coerced,
  // never trusting the client shape) per docs/specs/profile-data-layer.md.
  const canonical = body.profile_canonical
    ? parseCanonicalProfile(body.profile_canonical, { defaultSource: "user", at: new Date().toISOString() })
    : null;
  const { error: mpErr } = await supabase.from("master_profile").upsert(
    {
      user_id: user.id,
      data: {
        raw: body.profile,
        mirror: body.mirror ?? null,
        linkedin_url: body.linkedin_url ?? null,
        profile: canonical,
        profile_version: canonical ? 1 : null,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (mpErr) return NextResponse.json({ error: mpErr.message }, { status: 500 });

  // matches — RO's reasoning per role (upsert on the user×role unique key).
  if (body.matches?.length) {
    const rows = body.matches.map((m) => ({
      user_id: user.id,
      role_id: m.id,
      fit_score: m.fit,
      reasoning: { why: m.why },
      gaps: m.gaps,
      recommendation: m.recommendation,
      status: "new",
    }));
    const { error: mErr } = await supabase.from("matches").upsert(rows, { onConflict: "user_id,role_id" });
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  // append-only decision_events — the substrate the taste model is built from.
  // Idempotent on retry: only write the onboarding batch on FIRST save (no prior
  // onboarding events for this user). Corrections land at high weight (PRD §5.2).
  const { count: priorOnboarding } = await supabase
    .from("decision_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "onboarding");

  if ((priorOnboarding ?? 0) === 0) {
    const actions: OnboardingActions = {
      ...(body.onboarding ?? {}),
      scanned: body.onboarding?.scanned ?? 557,
      savedMatches: body.matches?.length ?? 0,
    };
    const rows = onboardingEvents(actions).map((r) => ({ ...r, user_id: user.id }));
    const { error: deErr } = await supabase.from("decision_events").insert(rows);
    if (deErr) return NextResponse.json({ error: deErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
