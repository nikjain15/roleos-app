import Link from "next/link";
import { Card } from "@/components/ui";
import { ProgressRing } from "@/components/feed/Motivation";

/**
 * "What moves you forward today" (docs/specs/feed-gamified.md). The short,
 * finishable action list — the top-3 agenda items — with a mini progress ring
 * that reflects REAL moves made today (from decision_events, capped at the daily
 * target of 3). On the design system. ro-voice, never a guilt-trip.
 */
export interface TodayItem {
  id: string;
  title: string;
  detail?: string;
  href?: string;
}

export function TodayActions({ items, movesToday, target = 3 }: { items: TodayItem[]; movesToday: number; target?: number }) {
  const done = Math.min(movesToday, target);
  const left = Math.max(0, target - done);
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-overline font-semibold uppercase text-tx3">What moves you forward today</span>
        <span className="ml-auto flex items-center gap-2 text-small font-semibold text-tx3">
          <ProgressRing done={done} total={target} size={22} />
          {done} of {target} today
        </span>
      </div>

      {left === 0 && done > 0 ? (
        <Card elevation="flat" className="bg-suc-bg">
          <p className="text-body font-semibold text-suc-tx">That&rsquo;s your three — today is yours. 🎉</p>
          <p className="mt-1 text-small text-tx2">Come back tomorrow — I&rsquo;ll have read the night for you.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.slice(0, 3).map((it) => (
            <Card key={it.id} elevation="flat" className="flex items-center gap-3.5 py-3.5">
              <span className="h-6 w-6 shrink-0 rounded-full border-2 border-bd2" aria-hidden />
              <div className="min-w-0">
                <p className="text-body font-semibold text-tx">{it.title}</p>
                {it.detail && <p className="text-small text-tx3">{it.detail}</p>}
              </div>
              {it.href && (
                <Link
                  href={it.href}
                  className="ml-auto shrink-0 rounded-full bg-primary px-3.5 py-2 text-small font-semibold text-primary-tx transition-colors hover:bg-primary-hover"
                >
                  Open →
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
