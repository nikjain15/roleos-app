"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DeskRow } from "@/lib/reply-desk";

/**
 * X9 — the reply desk's card stack. One waiting thread at a time, most urgent
 * first. Per card:
 *   D · Draft a reply    (fills a reply from the existing Gate-2 draft_reply)
 *   C · Copy             (copy the draft to paste into your own inbox)
 *   H · Handled / next   (you sent it yourself — move on)
 *   S · Not now          (skip without losing the thread)
 * RO drafts; you send. There is NO send button here — the draft is yours to send
 * from your mail client, exactly as Gate-2 has always worked. Keyboard-first,
 * aria-live progress, no countdowns.
 */

const REASON_LABEL: Record<DeskRow["reason"], string> = {
  scheduling: "Wants times",
  question: "Asked you something",
  followup_overdue: "Worth a nudge",
  thankyou: "Thank-you window",
};

function fmtSlot(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ReplyDeskClient() {
  const [rows, setRows] = useState<DeskRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/reply-desk", { method: "POST" });
        const data = (await res.json()) as { rows?: DeskRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "load failed");
        if (alive) setRows(data.rows ?? []);
      } catch {
        if (alive) setLoadErr("I couldn't reach your threads just now — refresh in a moment.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const total = rows?.length ?? 0;
  const row = rows?.[0] ?? null;

  const advance = useCallback(() => {
    setRows((r) => (r ? r.slice(1) : r));
    setReviewed((n) => n + 1);
    setDraft(null);
    setCopied(false);
    setErr(null);
  }, []);

  const makeDraft = useCallback(async () => {
    if (!row || busy || !row.classification) return;
    setBusy("draft");
    setErr(null);
    try {
      const res = await fetch("/api/recruiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft_reply",
          message: row.inbound || row.subject,
          classification: row.classification,
          availability: row.proposedSlots.map(fmtSlot),
        }),
      });
      const data = (await res.json()) as { draft?: { reply?: string; body?: string } | string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "draft failed");
      const d = data.draft;
      const text =
        typeof d === "string" ? d : (d?.reply ?? d?.body ?? JSON.stringify(d, null, 2));
      setDraft(text);
    } catch {
      setErr("Drafting hiccuped — try again, or reply from your inbox directly.");
    } finally {
      setBusy(null);
    }
  }, [row, busy]);

  const copy = useCallback(async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      setErr("Couldn't copy automatically — select the text and copy it.");
    }
  }, [draft]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === "d" || e.key === "D") void makeDraft();
      if (e.key === "c" || e.key === "C") void copy();
      if (e.key === "h" || e.key === "H") advance();
      if (e.key === "s" || e.key === "S") advance();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [makeDraft, copy, advance]);

  if (loadErr) {
    return (
      <p role="alert" className="text-[15px] text-dng">
        {loadErr}
      </p>
    );
  }
  if (rows === null) {
    return (
      <p aria-live="polite" className="text-[15px] text-tx2">
        Reading your threads…
      </p>
    );
  }

  if (total === 0) {
    return (
      <section className="rounded-xl border border-bd bg-surf2 p-6" aria-label="Desk clear">
        <p className="text-[15px] text-tx">
          Nothing waiting on you right now — every live thread has the ball in their court. I&apos;ll
          keep watching your recruiter mail and surface anything that needs a reply, a scheduling
          answer, or a nudge here.
        </p>
        <Link href="/tracker" className="mt-3 inline-block text-sm font-medium text-info hover:underline">
          See where every thread stands →
        </Link>
      </section>
    );
  }

  if (!row) {
    return (
      <section className="rounded-xl border border-bd bg-suc-bg p-6" aria-label="Desk complete">
        <p className="text-[15px] font-medium text-suc">
          Desk clear — {reviewed} handled. Those threads are moving again.
        </p>
        <Link href="/tracker" className="mt-2 inline-block text-sm text-info-tx underline">
          See where everything stands →
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Reply desk">
      <p aria-live="polite" className="text-xs text-tx3">
        {reviewed + 1} of {total} · most urgent first
      </p>

      <article className="mt-2 rounded-xl border border-bd bg-surf p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-info-bg px-2 py-0.5 text-xs font-medium text-info-tx">
            {REASON_LABEL[row.reason]}
          </span>
          {row.company && (
            <span className="text-xs text-tx3">
              {row.title} · {row.company}
            </span>
          )}
        </div>

        <p className="mt-2 text-[15px] font-semibold text-tx">{row.subject}</p>
        <p className="mt-0.5 text-xs text-tx3">{row.from}</p>
        {row.snippet && <p className="mt-2 text-[14px] text-tx2">{row.snippet}</p>}

        {row.reason === "scheduling" && row.proposedSlots.length > 0 && (
          <div className="mt-3 rounded-lg bg-surf2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
              Times that don&apos;t clash with your calendar
            </p>
            <ul className="mt-1 flex flex-wrap gap-2 text-[13px] text-tx2">
              {row.proposedSlots.map((s) => (
                <li key={s} className="rounded border border-bd px-2 py-0.5">
                  {fmtSlot(s)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {draft !== null && (
          <div className="mt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
              Your draft — edit it, then send it from your own inbox
            </label>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setCopied(false);
              }}
              rows={8}
              className="mt-1 w-full rounded-lg border border-bd bg-surf2 p-3 text-[14px] text-tx"
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {draft === null ? (
            <button
              onClick={makeDraft}
              disabled={!!busy}
              className="min-h-10 rounded-md bg-info px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "draft" ? "Drafting…" : "Draft a reply (D)"}
            </button>
          ) : (
            <button
              onClick={copy}
              className="min-h-10 rounded-md bg-info px-4 text-sm font-medium text-white"
            >
              {copied ? "Copied ✓" : "Copy draft (C)"}
            </button>
          )}
          <button
            onClick={advance}
            disabled={!!busy}
            className="min-h-10 rounded-md border border-bd px-4 text-sm text-tx2 disabled:opacity-50"
          >
            Handled — next (H)
          </button>
          <button
            onClick={advance}
            disabled={!!busy}
            className="min-h-10 rounded-md border border-bd px-4 text-sm text-tx3 disabled:opacity-50"
          >
            Not now (S)
          </button>
        </div>
        <p className="mt-2 text-[11px] text-tx3">
          I only draft — nothing is ever sent from here. You send it yourself, from your inbox,
          when it reads right to you.
        </p>
        {err && (
          <p role="alert" className="mt-2 text-xs text-dng">
            {err}
          </p>
        )}
      </article>
    </section>
  );
}
