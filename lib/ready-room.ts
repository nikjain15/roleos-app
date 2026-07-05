/**
 * Ready-room (slice X10, docs/specs/x10-ready-room.md) — pure assembly of the
 * morning review queue. The overnight hunt (X1) fills Tracker "Ready" with
 * truth-gated drafts; this turns those rows into reviewable cards: one honest
 * decision at a time, FIFO (oldest first — no cherry-picking anxiety), with
 * truth flags surfaced BEFORE approval is possible. No model calls; the room
 * reviews, it never generates. Sending stays the user's per-item click on the
 * existing Apply page.
 */

export interface QueueApp {
  id: string;
  role_id: string | null;
  stage: string;
  artifact_ids: string[] | null;
  created_at: string;
}

export interface QueueArtifact {
  id: string;
  role_id: string | null;
  type: string;
  status: string; // draft | needs_your_eyes | approved | sent
  content: { summary?: string; bullets?: Array<{ text?: string }> } | null;
  provenance: {
    gate_status?: string;
    truth?: { ok?: boolean; violations?: unknown[] } | null;
    app_score?: { score?: number; screen_likelihood?: string } | null;
    source?: string;
  } | null;
}

export interface QueueRole {
  id: string;
  company: string;
  role_title: string;
}

export interface QueueMatch {
  role_id: string;
  fit_score: number | null;
  reasoning: { why?: string } | null;
}

export interface ReadyCard {
  applicationId: string;
  artifactId: string;
  roleId: string;
  company: string;
  title: string;
  stage: string;
  /** The résumé's one-paragraph summary + first bullets, for the card. */
  summary: string | null;
  bullets: string[];
  why: string | null;
  fit: number | null;
  score: { score: number; likelihood: string } | null;
  /** Truth flags — shown ALWAYS when present; flagged cards can't one-click approve. */
  truthFlags: string[];
  /** draft → approvable here; needs_your_eyes → editor first; approved → straight to apply. */
  approvable: boolean;
  alreadyApproved: boolean;
  fromHunt: boolean;
}

/** Stages the room reviews. `ready` is the queue; `drafting` joins only when flagged by the hunt. */
const ROOM_STAGES = new Set(["ready", "drafting"]);

export function assembleQueue(
  apps: QueueApp[],
  artifactsById: Map<string, QueueArtifact>,
  rolesById: Map<string, QueueRole>,
  matchesByRole: Map<string, QueueMatch>,
): ReadyCard[] {
  const cards: ReadyCard[] = [];
  for (const app of [...apps].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!ROOM_STAGES.has(app.stage) || !app.role_id) continue;
    // Newest linked résumé artifact wins; apps without one aren't reviewable here.
    const artifact = (app.artifact_ids ?? [])
      .map((id) => artifactsById.get(id))
      .filter((a): a is QueueArtifact => Boolean(a && a.type === "resume"))
      .pop();
    if (!artifact || artifact.status === "sent") continue;
    // A `drafting` app belongs here only when it's the hunt's flagged output —
    // in-progress manual drafts stay in the studio flow.
    if (app.stage === "drafting" && artifact.provenance?.source !== "overnight_hunt") continue;

    const role = rolesById.get(app.role_id);
    if (!role) continue;
    const match = matchesByRole.get(app.role_id);
    const truth = artifact.provenance?.truth;
    const truthFlags =
      truth && truth.ok === false && Array.isArray(truth.violations)
        ? truth.violations.map((v) => String(v)).slice(0, 6)
        : [];
    const score = artifact.provenance?.app_score;

    cards.push({
      applicationId: app.id,
      artifactId: artifact.id,
      roleId: app.role_id,
      company: role.company,
      title: role.role_title,
      stage: app.stage,
      summary: artifact.content?.summary ?? null,
      bullets: (artifact.content?.bullets ?? [])
        .map((b) => b?.text ?? "")
        .filter((t) => t.length > 0)
        .slice(0, 3),
      why: match?.reasoning?.why ?? null,
      fit: match?.fit_score ?? null,
      score:
        score && typeof score.score === "number"
          ? { score: score.score, likelihood: String(score.screen_likelihood ?? "") }
          : null,
      truthFlags,
      // The room one-click-approves ONLY clean drafts. Flagged output goes to
      // the editor first — a flag you can dismiss without reading isn't a gate.
      approvable: artifact.status === "draft" && truthFlags.length === 0,
      alreadyApproved: artifact.status === "approved",
      fromHunt: artifact.provenance?.source === "overnight_hunt",
    });
  }
  return cards;
}
