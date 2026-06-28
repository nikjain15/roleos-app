"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  type Cadence,
  type NotifSettings,
  type QuietHours,
  DEFAULT_NOTIF_SETTINGS,
  DEFAULT_QUIET_HOURS,
} from "@/lib/notifications";

/**
 * Notification & quiet-hours settings (journey.html §10). One cadence choice +
 * quiet hours. RO earns the right to interrupt; this is where the user sets the
 * terms. Voice per ro-voice.html: warm, honest, never guilt. Saved to the user's
 * profiles row (RLS-scoped). The engine in lib/notifications enforces it.
 */

const CADENCES: { id: Cadence; label: string; blurb: string }[] = [
  { id: "realtime", label: "Real-time", blurb: "Ping me when something needs me. Still rare — I never spam." },
  { id: "daily", label: "Daily digest", blurb: "Once a day: what I did, what needs you. The default, and a calm one." },
  { id: "weekly", label: "Weekly digest", blurb: "A quieter rhythm — one round-up a week." },
  { id: "open", label: "Only when I open", blurb: "I won't interrupt you at all. Everything waits in your feed." },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const fmtHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

export default function Settings() {
  const [cadence, setCadence] = useState<Cadence>(DEFAULT_NOTIF_SETTINGS.cadence);
  const [quiet, setQuiet] = useState<QuietHours>(DEFAULT_QUIET_HOURS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        window.location.href = "/login?next=/settings";
        return;
      }
      const { data: row } = await sb
        .from("profiles")
        .select("notif_settings, quiet_hours")
        .eq("id", data.user.id)
        .single();
      const ns = row?.notif_settings as Partial<NotifSettings> | null;
      const qh = row?.quiet_hours as Partial<QuietHours> | null;
      if (ns?.cadence) setCadence(ns.cadence);
      if (qh) setQuiet({ ...DEFAULT_QUIET_HOURS, ...qh });
      setLoading(false);
    });
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (data.user) {
      await sb
        .from("profiles")
        .update({ notif_settings: { cadence }, quiet_hours: quiet })
        .eq("id", data.user.id);
    }
    setBusy(false);
    setSaved(true);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-md bg-info px-2 py-0.5 text-[13px] text-white">RO</span>
          RoleOS
        </span>
        <Link href="/feed" className="text-sm text-tx3">← feed</Link>
      </div>

      <h1 className="mt-8 text-2xl font-bold tracking-tight">How I reach you</h1>
      <p className="mt-2 text-tx2">
        I earn the right to interrupt — and when you go quiet, I go quieter. Set the terms; I&apos;ll
        respect them.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-tx3">Loading your settings…</p>
      ) : (
        <>
          <section className="mt-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-tx3">Cadence</p>
            <div className="space-y-2">
              {CADENCES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setCadence(c.id); setSaved(false); }}
                  className={`block w-full rounded-xl border p-4 text-left ${
                    cadence === c.id ? "border-info bg-info-bg/40" : "border-bd bg-surf"
                  }`}
                >
                  <p className="text-sm font-semibold text-tx">{c.label}</p>
                  <p className="mt-0.5 text-xs text-tx2">{c.blurb}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-tx3">Quiet hours</p>
            <div className="rounded-xl border border-bd bg-surf p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-tx2">
                <span>No pings from</span>
                <select
                  value={quiet.start}
                  onChange={(e) => { setQuiet((q) => ({ ...q, start: +e.target.value })); setSaved(false); }}
                  className="rounded-md border border-bd bg-surf2 px-2 py-1 text-tx"
                >
                  {HOURS.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                </select>
                <span>to</span>
                <select
                  value={quiet.end}
                  onChange={(e) => { setQuiet((q) => ({ ...q, end: +e.target.value })); setSaved(false); }}
                  className="rounded-md border border-bd bg-surf2 px-2 py-1 text-tx"
                >
                  {HOURS.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                </select>
                <span>— only a real deadline breaks through, gently.</span>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-tx2">
                <input
                  type="checkbox"
                  checked={quiet.weekendsOff}
                  onChange={(e) => { setQuiet((q) => ({ ...q, weekendsOff: e.target.checked })); setSaved(false); }}
                />
                Keep weekends quiet (no interruptions Sat–Sun)
              </label>
            </div>
          </section>

          <div className="mt-8 flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-sm text-suc">Saved — I&apos;ve got it.</span>}
          </div>

          <p className="mt-8 text-xs text-tx3">
            I&apos;ll never guilt-trip you, manufacture urgency, or nudge you to come back. If resting
            is the right call, I&apos;ll say so.
          </p>
        </>
      )}
    </main>
  );
}
