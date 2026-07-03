import type { RoleFit } from "@/lib/explore-fit";

/**
 * Per-role fit indicator on the public Index (roles-workspace P0-7). Two honest
 * flavours, visually distinct so an estimate never masquerades as a scored fit:
 *   • scored — RO's real reasoned fit + verdict (same meaning as the workspace);
 *   • estimated — embedding-similarity tier relative to the viewer's profile.
 */
const TIER_STYLE: Record<string, string> = {
  strong: "bg-suc-bg text-suc",
  look: "bg-info-bg text-info-tx",
  weak: "bg-surf2 text-tx3",
};

const TIER_LABEL: Record<string, string> = {
  strong: "strong signal",
  look: "worth a look",
  weak: "weaker signal",
};

const VERDICT_STYLE: Record<string, string> = {
  pursue: "bg-suc-bg text-suc",
  maybe: "bg-info-bg text-info-tx",
  skip: "bg-surf2 text-tx3",
};

export default function FitBadge({ fit }: { fit: RoleFit }) {
  if (fit.kind === "scored") {
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${VERDICT_STYLE[fit.verdict]}`}
        title="RO scored this role against your full profile — see it in your Roles workspace"
      >
        {fit.fit !== null ? `fit ${fit.fit} · ` : ""}
        {fit.verdict}
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] ${TIER_STYLE[fit.tier]}`}
      title="Estimated from your profile's similarity to this role — RO hasn't deep-scored it yet"
    >
      {TIER_LABEL[fit.tier]} · est
    </span>
  );
}
