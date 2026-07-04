"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalRow } from "@/lib/goal";
import type { Plan } from "@/lib/plan/types";
import PlanSummary from "@/components/PlanSummary";

/**
 * Goal Setter (goal-engine.md §1). Captures the goal — target, deadline (hard/
 * soft), constraints, intensity, "also open to" — and on save shows the live
 * pace plan RO computes. Setting a goal changes no outward state; plan changes
 * are proposed here, never auto-applied elsewhere. a11y: labelled fields.
 */
export default function GoalSetter({ initial }: { initial: GoalRow | null }) {
  const router = useRouter();
  const [archetype, setArchetype] = useState(initial?.target?.archetype ?? "");
  const [seniority, setSeniority] = useState(initial?.target?.seniority ?? "");
  const [companyType, setCompanyType] = useState(initial?.target?.company_type ?? "");
  const [location, setLocation] = useState(initial?.target?.location ?? "");
  const [compFloor, setCompFloor] = useState(initial?.target?.comp_floor?.toString() ?? "");
  const [deadline, setDeadline] = useState(initial?.deadline_date ?? "");
  const [hard, setHard] = useState(initial?.deadline_hard ?? false);
  const [visa, setVisa] = useState(initial?.constraints?.visa ?? "");
  const [hoursPerWeek, setHoursPerWeek] = useState(initial?.intensity?.hours_per_week?.toString() ?? "");
  const [appsCeiling, setAppsCeiling] = useState(
    initial?.intensity?.apps_per_week_ceiling?.toString() ?? "",
  );
  const [alsoOpenTo, setAlsoOpenTo] = useState(
    (initial?.also_open_to?.text as string | undefined) ?? "",
  );

  const [saveAsNew, setSaveAsNew] = useState(false); // W7 multi-goal-lite
  const [plan, setPlan] = useState<Plan | null>(initial?.plan ?? null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: {
            archetype: archetype.trim() || undefined,
            seniority: seniority.trim() || undefined,
            company_type: companyType.trim() || undefined,
            location: location.trim() || undefined,
            comp_floor: compFloor ? Number(compFloor) : undefined,
          },
          deadline_date: deadline || null,
          deadline_hard: hard,
          constraints: visa.trim() ? { visa: visa.trim() } : null,
          intensity: {
            hours_per_week: hoursPerWeek ? Number(hoursPerWeek) : undefined,
            apps_per_week_ceiling: appsCeiling ? Number(appsCeiling) : undefined,
          },
          also_open_to: alsoOpenTo.trim() ? { text: alsoOpenTo.trim() } : null,
          save_as_new: saveAsNew || undefined,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; plan?: Plan; error?: string };
      if (res.ok && j.plan) {
        setPlan(j.plan);
        setSaveAsNew(false);
        router.refresh(); // keep the alternates list (W7) in sync
      } else {
        setErr(j.error ?? "Couldn't save the goal.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <form onSubmit={save} className="space-y-4">
        <Field label="Role you're aiming for" hint="e.g. Senior AI Product Manager">
          <input className={inputCls} value={archetype} onChange={(e) => setArchetype(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seniority">
            <input className={inputCls} value={seniority} onChange={(e) => setSeniority(e.target.value)} placeholder="Senior / Staff" />
          </Field>
          <Field label="Company type">
            <input className={inputCls} value={companyType} onChange={(e) => setCompanyType(e.target.value)} placeholder="Series B+ / FAANG" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location / remote">
            <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote US" />
          </Field>
          <Field label="Comp floor ($)">
            <input className={inputCls} type="number" inputMode="numeric" value={compFloor} onChange={(e) => setCompFloor(e.target.value)} placeholder="220000" />
          </Field>
        </div>

        <Field label="Target date" hint="When you want an offer in hand">
          <div className="flex items-center gap-3">
            <input className={inputCls} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-tx2">
              <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />
              hard date
            </label>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Hours/week you'll invest">
            <input className={inputCls} type="number" inputMode="numeric" value={hoursPerWeek} onChange={(e) => setHoursPerWeek(e.target.value)} placeholder="10" />
          </Field>
          <Field label="Max applications/week" hint="Your realistic ceiling">
            <input className={inputCls} type="number" inputMode="numeric" value={appsCeiling} onChange={(e) => setAppsCeiling(e.target.value)} placeholder="8" />
          </Field>
        </div>

        <Field label="Visa / work authorization" hint="Optional — so RO filters honestly">
          <input className={inputCls} value={visa} onChange={(e) => setVisa(e.target.value)} placeholder="Need sponsorship" />
        </Field>
        <Field label="Also open to" hint="Widens sourcing, no separate plan">
          <input className={inputCls} value={alsoOpenTo} onChange={(e) => setAlsoOpenTo(e.target.value)} placeholder="BizOps, Chief of Staff" />
        </Field>

        {initial && (
          <label className="flex items-center gap-1.5 text-sm text-tx2">
            <input type="checkbox" checked={saveAsNew} onChange={(e) => setSaveAsNew(e.target.checked)} />
            Save as a new goal — keep my current one as an alternate
          </label>
        )}

        {err && <p className="text-sm text-dng">{err}</p>}
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 w-full rounded-md bg-info px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Building your plan…" : plan ? "Update goal & re-plan" : "Set goal & build my plan"}
        </button>
      </form>

      <div>
        {plan ? (
          <PlanSummary plan={plan} onGoToFeed={() => router.push("/feed")} />
        ) : (
          <div className="rounded-xl border border-bd bg-surf2 p-5 text-[15px] text-tx2">
            <p>Fill in your goal and I&apos;ll compute a real plan: the backward funnel, your weekly pace, the apply-by date, and whether it&apos;s feasible — candidly.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-bd bg-surf p-2 text-[15px] text-tx focus:border-info";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-tx2">{label}</span>
      {hint && <span className="ml-2 text-xs text-tx3">{hint}</span>}
      {children}
    </label>
  );
}
