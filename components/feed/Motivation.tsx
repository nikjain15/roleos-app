import { Card } from "@/components/ui";
import type { WeekDot } from "@/lib/feed/streak";
import type { PathMilestone } from "@/lib/feed/model";

/**
 * The gamified feed's motivation layer (docs/specs/feed-gamified.md) — streak,
 * momentum, and the path. Presentational, server-rendered, built strictly on the
 * design system: grape = `primary`, energy = `volt`, streak flame = `coral`,
 * `font-display` headings, `<Card>` containers. SVG strokes reference the token
 * CSS vars (never literal hex).
 */

/** A ring that fills `done/total` — grape→volt gradient (energy). */
export function ProgressRing({ done, total, size = 112 }: { done: number; total: number; size?: number }) {
  const r = size / 2 - size * 0.05;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, done / total) : 0;
  const sw = size * 0.1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surf3)" strokeWidth={sw} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--volt)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** The streak hero — the motivator. Flame + week dots (coral). */
export function StreakCard({ streak, week }: { streak: number; week: WeekDot[] }) {
  if (streak === 0) {
    return (
      <Card elevation="flat">
        <div className="flex items-center gap-4">
          <span className="text-4xl">✨</span>
          <div>
            <p className="font-display text-h3 font-semibold text-tx">Start your streak</p>
            <p className="text-small text-tx2">One real move today and you&rsquo;re on the board.</p>
          </div>
        </div>
      </Card>
    );
  }
  const movedToday = week.find((d) => d.isToday)?.active ?? false;
  const daysLeftInWeek = week.filter((d) => !d.active).length;
  return (
    <Card elevation="flat">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-[40px] leading-none">🔥</span>
        <div>
          <p className="font-display text-h2 font-bold leading-none text-tx">{streak}-day streak</p>
          <p className="mt-1 text-small font-semibold text-tx2">{movedToday ? "still going strong" : "keep it alive"}</p>
        </div>
        <div className="ml-auto flex gap-2.5">
          {week.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-overline ${
                  d.isToday && d.active
                    ? "bg-coral text-white ring-2 ring-coral ring-offset-2 ring-offset-surf"
                    : d.active
                      ? "bg-coral text-white"
                      : d.isToday
                        ? "bg-surf3 text-tx2 ring-2 ring-coral ring-offset-2 ring-offset-surf"
                        : "bg-surf3 text-tx3"
                }`}
              >
                {d.active ? "✓" : d.isToday ? "🔥" : ""}
              </span>
              <span className="text-overline text-tx3">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3.5 text-small text-tx2">
        {movedToday ? (
          <>You&rsquo;ve moved today — <b className="font-semibold text-tx">{streak} days</b> and counting.</>
        ) : (
          <>Move once today and it&rsquo;s <b className="font-semibold text-tx">{streak + 1} days</b>{daysLeftInWeek > 0 ? <> — {daysLeftInWeek} more and you&rsquo;ve run the whole week.</> : "."}</>
        )}
      </p>
    </Card>
  );
}

/** Three quiet momentum stats: momentum (volt), pace, week-of-plan. */
export function MomentumAspects({
  momentum,
  ratio,
  week,
  weeks,
  onTrack,
}: {
  momentum: number;
  ratio: number | null;
  week: number | null;
  weeks: number | null;
  onTrack: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <Card className="border-l-2 border-l-volt" elevation="flat">
        <p className="flex items-baseline gap-1.5 font-display text-h3 font-bold text-tx">+{momentum} <span className="text-volt">⚡</span></p>
        <p className="mt-1.5 text-small text-tx3">momentum today</p>
      </Card>
      <Card elevation="flat">
        <p className="font-display text-h3 font-bold text-tx">{ratio && ratio >= 1 ? `${ratio}×` : ratio ? `${ratio}×` : "—"}</p>
        <p className="mt-1.5 text-small text-tx3">{ratio ? "vs last week" : "first week of moves"}</p>
      </Card>
      <Card elevation="flat">
        <p className="font-display text-h3 font-bold text-tx">{week && weeks ? `Week ${week}` : "No goal"} {week && weeks ? <span className="text-small font-medium text-tx3">/{weeks}</span> : null}</p>
        <p className={`mt-1.5 text-small font-semibold ${onTrack ? "text-suc" : "text-tx3"}`}>{week && weeks ? (onTrack ? "↑ ahead of pace" : "keep moving") : "set one to pace it"}</p>
      </Card>
    </div>
  );
}

/** The goal journey as a constellation. done = grape, current = grape + volt ring. */
export function PathConstellation({ path, goalLabel, onTrack }: { path: PathMilestone[]; goalLabel: string; onTrack: boolean }) {
  const pts = [
    { x: 8, y: 38 },
    { x: 31, y: 66 },
    { x: 54, y: 31 },
    { x: 77, y: 72 },
    { x: 91, y: 45 },
  ];
  const lastDone = path.reduce((acc, s, i) => (s.done ? i : acc), -1);
  const linePts = pts.map((p) => `${(p.x / 100) * 560},${(p.y / 100) * 58}`);
  const donePts = linePts.slice(0, Math.max(1, lastDone + 1)).join(" ");
  return (
    <Card elevation="flat">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-overline font-semibold uppercase text-tx3">Your path · {goalLabel}</span>
        <span className={`text-small font-bold ${onTrack ? "text-suc" : "text-tx3"}`}>{onTrack ? "on track" : "in motion"}</span>
      </div>
      <div className="relative h-[58px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 560 58" preserveAspectRatio="none" aria-hidden>
          <polyline points={linePts.join(" ")} fill="none" stroke="var(--bd)" strokeWidth="2" />
          <polyline points={donePts} fill="none" stroke="var(--primary)" strokeWidth="2" />
        </svg>
        {path.map((m, i) => (
          <div key={m.key} className="absolute w-[74px] -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${pts[i].x}%`, top: `${pts[i].y}%` }}>
            <span
              className={`mx-auto block h-3 w-3 rounded-full ${
                m.current ? "bg-primary ring-4 ring-volt" : m.done ? "bg-primary" : "bg-bd2"
              }`}
            />
            <span className="mt-2 block text-overline font-semibold text-tx3">
              {m.label}{m.count > 0 && m.key !== "found" ? ` ${m.count}` : ""}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
