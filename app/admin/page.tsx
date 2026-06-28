import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getAdminStats, getDemandStats, RUNS_WINDOW, type DemandStats } from "@/lib/admin-stats";

/**
 * Admin dashboard (journey.html §6 admin panel, Phase 4). Costs + models +
 * quality-gate pass-rates from agent_runs — the data already flows from every
 * metered model call. Server component: requireAdmin re-checks role === 'admin'
 * (the real lock), then reads aggregates. Admin-only by route + RLS.
 */
export const dynamic = "force-dynamic";

const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0")}`;
const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default async function AdminDashboard() {
  await requireAdmin();
  const s = await getAdminStats();
  const d = await getDemandStats();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-md bg-info px-2 py-0.5 text-[13px] text-white">RO</span>
          RoleOS
          <span className="ml-1 rounded-full bg-warn-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
            admin
          </span>
        </span>
        <Link href="/feed" className="text-sm text-tx3">
          ← feed
        </Link>
      </div>

      <h1 className="mt-8 text-xl font-bold tracking-tight">What RO&apos;s costing, and how she&apos;s grading</h1>
      <p className="mt-1 text-sm text-tx3">
        Every model call is metered in the path. {s.capped ? `Last ${RUNS_WINDOW.toLocaleString()} runs` : `All ${s.totals.runs.toLocaleString()} runs`}
        {s.capped && <span className="text-warn"> (window capped — older runs not shown)</span>}.
      </p>

      {/* Demand — what users are hunting for (drives ingestion) */}
      <DemandView d={d} />

      {s.totals.runs === 0 ? (
        <div className="mt-8 rounded-xl border border-bd bg-surf2 p-6 text-[15px] text-tx2">
          No model calls logged yet. Run an onboarding or a gate and they&apos;ll show up here.
        </div>
      ) : (
        <>
          {/* headline tiles */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Total spend" value={usd(s.totals.costUsd)} />
            <Tile label="Model calls" value={s.totals.runs.toLocaleString()} />
            <Tile
              label="Tokens (in / out)"
              value={`${tok(s.totals.inTok)} / ${tok(s.totals.outTok)}`}
            />
            <Tile
              label="Gate pass-rate"
              value={s.quality.passRate === null ? "—" : `${s.quality.passRate}%`}
              hint={s.quality.judged ? `${s.quality.passed}/${s.quality.judged} judged` : "no judged outputs"}
              tone={
                s.quality.passRate === null
                  ? "neutral"
                  : s.quality.passRate >= 70
                    ? "good"
                    : "warn"
              }
            />
          </div>

          {/* cost by model */}
          <Section title="Cost by model">
            <Bars rows={s.byModel} total={s.totals.costUsd} />
          </Section>

          {/* cost by skill */}
          <Section title="Cost by skill">
            <Bars rows={s.bySkill.slice(0, 12)} total={s.totals.costUsd} />
          </Section>

          {/* quality detail */}
          <Section title="Quality gate (primary outputs)">
            {s.quality.judged === 0 ? (
              <p className="text-sm text-tx3">No judged primary outputs in this window.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <Stat label="Passed clean" v={s.quality.passed} of={s.quality.judged} tone="good" />
                <Stat
                  label="Needs your eyes"
                  v={s.quality.needsEyes}
                  of={s.quality.judged}
                  tone="warn"
                />
                <p className="pt-1 text-xs text-tx3">
                  &ldquo;Needs your eyes&rdquo; isn&apos;t failure — it&apos;s RO refusing to ship
                  something she can&apos;t vouch for (truth-gate or voice). That&apos;s the gate
                  working.
                </p>
              </div>
            )}
          </Section>

          {/* recent runs */}
          <Section title="Recent calls">
            <div className="overflow-hidden rounded-xl border border-bd">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surf2 text-left text-[11px] uppercase tracking-wide text-tx3">
                    <th className="px-3 py-2 font-semibold">Skill</th>
                    <th className="px-3 py-2 font-semibold">Model</th>
                    <th className="px-3 py-2 text-right font-semibold">Cost</th>
                    <th className="px-3 py-2 font-semibold">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((r, i) => (
                    <tr key={i} className="border-t border-bd">
                      <td className="px-3 py-2 font-mono text-xs text-tx">{r.skill ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-tx2">{r.model.replace("claude-", "")}</td>
                      <td className="px-3 py-2 text-right text-xs text-tx2">{usd(r.costUsd)}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.status ? (
                          <span
                            className={
                              r.status === "passed" ? "text-suc" : "text-warn"
                            }
                          >
                            {r.status === "passed" ? "passed" : "needs eyes"}
                          </span>
                        ) : (
                          <span className="text-tx3">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </main>
  );
}

function DemandView({ d }: { d: DemandStats }) {
  const chips = (rows: { key: string; count: number }[]) =>
    rows.length === 0 ? (
      <span className="text-sm text-tx3">— nothing yet</span>
    ) : (
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <span key={r.key} className="rounded-full bg-surf2 px-2.5 py-1 text-xs text-tx2">
            {r.key} <span className="font-semibold text-tx">·{r.count}</span>
          </span>
        ))}
      </div>
    );

  return (
    <Section title="Demand — what people are hunting for (drives ingestion)">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Watchers" value={d.watchers.toLocaleString()} hint="active 'keep me in the loop' intents" />
        <Tile label="Pushing hard" value={d.pushing.toLocaleString()} hint="in push mode" tone={d.pushing ? "good" : "neutral"} />
        <Tile label="Roles in corpus" value={d.corpusTotal.toLocaleString()} hint="seed + hunted" />
        <Tile label="Hunted in (ATS)" value={d.ingestedTotal.toLocaleString()} hint="added by ingestion" tone={d.ingestedTotal ? "good" : "neutral"} />
      </div>
      {d.recentIngested.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-tx">Recently hunted in</p>
          <div className="flex flex-wrap gap-2">
            {d.recentIngested.map((r, i) => (
              <span key={i} className="rounded-full bg-suc-bg px-2.5 py-1 text-xs text-suc">
                {r.company} · {r.role_title}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-tx">Most-wanted companies</p>
          {chips(d.topCompanies)}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-tx">Target roles</p>
          {chips(d.topRoles)}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-tx">Role keywords</p>
          {chips(d.topKeywords)}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-tx">Locations</p>
          {chips(d.topLocations)}
        </div>
      </div>
      <p className="mt-3 text-xs text-tx3">
        This is the demand signal the ingestion pipeline reads — we fetch the roles &amp; companies
        people actually want, growing the corpus where it matters.
      </p>
    </Section>
  );
}

function Tile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const c = tone === "good" ? "text-suc" : tone === "warn" ? "text-warn" : "text-tx";
  return (
    <div className="rounded-xl border border-bd bg-surf p-4">
      <p className="text-[11px] uppercase tracking-wide text-tx3">{label}</p>
      <p className={`mt-1 text-lg font-bold ${c}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-tx3">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-tx3">{title}</p>
      {children}
    </section>
  );
}

function Bars({
  rows,
  total,
}: {
  rows: { key: string; runs: number; costUsd: number }[];
  total: number;
}) {
  const max = Math.max(...rows.map((r) => r.costUsd), 1e-9);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3 text-sm">
          <span className="w-44 shrink-0 truncate font-mono text-xs text-tx2" title={r.key}>
            {r.key.replace("claude-", "")}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surf2">
            <div className="h-full bg-info" style={{ width: `${(r.costUsd / max) * 100}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right text-xs text-tx2">{usd(r.costUsd)}</span>
          <span className="w-10 shrink-0 text-right text-[11px] text-tx3">{r.runs}×</span>
        </div>
      ))}
    </div>
  );
}

function Stat({
  label,
  v,
  of,
  tone,
}: {
  label: string;
  v: number;
  of: number;
  tone: "good" | "warn";
}) {
  const pct = of ? Math.round((v / of) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-tx2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surf2">
        <div
          className={`h-full ${tone === "good" ? "bg-suc" : "bg-warn"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs text-tx2">
        {v} ({pct}%)
      </span>
    </div>
  );
}
