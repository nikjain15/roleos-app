import { Card, Badge } from "@/components/ui";
import { liftLabel, type MeterView } from "@/lib/resume/meter";

/**
 * The slim readiness meter (docs/specs/resume-editor-v2.md §"The editor UX" #1).
 * Presentational — renders a P1 score's honest view model: tier badge, tiered
 * track with the score marker, `+N from your master`, the one next move, and the
 * fixed caveat. No outcome/odds language. Built on the design-system primitives.
 */
export default function ReadinessMeter({ view }: { view: MeterView }) {
  const lift = liftLabel(view.lift);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary" dot>
            {view.tierLabel}
          </Badge>
          {lift && <span className="text-small font-medium text-tx2">↑ {lift}</span>}
        </div>
        <div className="shrink-0 text-right">
          <span className="font-display text-2xl font-bold tracking-tight">{view.score}</span>
          <span className="text-small text-tx3">/100</span>
        </div>
      </div>

      {/* tiered track: filled to the score, honest tier bands beneath */}
      <div className="mt-4">
        <div className="relative h-2 rounded-full bg-surf2" role="img" aria-label={`Readiness ${view.score} of 100`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${view.track.markerPct}%` }} />
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surf bg-primary"
            style={{ left: `${view.track.markerPct}%` }}
          />
        </div>
        <div className="relative mt-1 h-4">
          {view.track.tiers
            .filter((t) => t.startPct > 0)
            .map((t) => (
              <span
                key={t.id}
                className="absolute -translate-x-1/2 text-[10px] uppercase tracking-wide text-tx3"
                style={{ left: `${t.startPct}%` }}
              >
                {t.label}
              </span>
            ))}
        </div>
      </div>

      {view.nextMove && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-surf2 px-3 py-2">
          <span className="text-small text-tx2">
            One next move — <span className="text-tx font-medium">{view.nextMove.text}</span>
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-spark px-2 py-0.5 text-small font-medium text-spark-ink">
            +{view.nextMove.deltaPoints}
          </span>
        </div>
      )}

      <p className="mt-3 text-small text-tx3">{view.caveat}</p>
    </Card>
  );
}
