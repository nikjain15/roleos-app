"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * "Keep me in the loop" (journey.html §11 intents). The user tells RO what
 * they're hunting for — role, keywords, companies, location, comp, how hard
 * they're pushing. It saves to their active intent and becomes the demand
 * signal RO uses to go find more (demand-driven ingestion). Voice per ro-voice.
 */
type Intent = {
  target_role?: string | null;
  keywords?: string[];
  companies?: string[];
  location?: string | null;
  comp?: { target_base_usd?: number } | null;
  intensity?: number;
  notify?: boolean;
};

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function Watch() {
  const [role, setRole] = useState("");
  const [keywords, setKeywords] = useState("");
  const [companies, setCompanies] = useState("");
  const [location, setLocation] = useState("");
  const [base, setBase] = useState("");
  const [intensity, setIntensity] = useState(1);
  const [notify, setNotify] = useState(true);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/watch")
      .then((r) => r.json())
      .then(({ intent }: { intent: Intent | null }) => {
        if (!intent) return;
        setRole(intent.target_role ?? "");
        setKeywords((intent.keywords ?? []).join(", "));
        setCompanies((intent.companies ?? []).join(", "));
        setLocation(intent.location ?? "");
        setBase(intent.comp?.target_base_usd ? String(intent.comp.target_base_usd) : "");
        setIntensity(intent.intensity ?? 1);
        setNotify(intent.notify ?? true);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_role: role,
          keywords: list(keywords),
          companies: list(companies),
          location,
          target_base_usd: base ? Number(base.replace(/[^0-9]/g, "")) : null,
          intensity,
          notify,
        }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const intensityLabel = ["", "Just exploring", "Keen — show me more", "Pushing hard for this"][intensity];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/feed" className="text-sm text-tx3">← feed</Link>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Keep me in the loop</h1>
      <p className="mt-2 text-tx2">
        Tell me what you&apos;re hunting for and I&apos;ll keep watch — pulling in roles that fit, not
        just what&apos;s already on my list. The more specific you are, the sharper I get.
      </p>

      <div className="mt-8 space-y-5">
        <Field label="The role you want" hint="e.g. Senior AI Product Manager">
          <input value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} placeholder="Senior AI Product Manager" />
        </Field>

        <Field label="Role keywords" hint="comma-separated — titles or focus areas I should match on">
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={inputCls} placeholder="AI PM, ML platform, 0-to-1, eval frameworks" />
        </Field>

        <Field label="Companies you'd love" hint="comma-separated — I'll prioritise watching these">
          <input value={companies} onChange={(e) => setCompanies(e.target.value)} className={inputCls} placeholder="Anthropic, Stripe, Ramp, Notion" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Location" hint="city or 'remote'">
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="SF / remote" />
          </Field>
          <Field label="Target base" hint="USD, optional">
            <input value={base} onChange={(e) => setBase(e.target.value)} className={inputCls} placeholder="$250k" />
          </Field>
        </div>

        <Field label={`How hard are you pushing? — ${intensityLabel}`} hint="this sets how actively I work it">
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="w-full accent-[var(--info)]"
          />
        </Field>

        <label className="flex items-center gap-3 text-sm text-tx2">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[var(--info)]" />
          Keep me posted when I find new fits (respects your quiet hours)
        </label>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : saved ? "Saved — I'm on it" : "Keep me in the loop"}
          </button>
          {saved && <span className="text-sm text-suc">Got it. I&apos;ll widen the search and keep watch.</span>}
        </div>
      </div>
    </main>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-bd bg-surf px-3 py-2 text-[15px] text-tx outline-none focus:border-info";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-tx">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-tx3">{hint}</p>}
    </div>
  );
}
