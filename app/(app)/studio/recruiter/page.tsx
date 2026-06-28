"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Gate 2 studio — screening / recruiter (journey §7). RO reads recruiter mail +
 * calendar (readonly), classifies, and drafts replies / screening answers from
 * the master profile. Every outbound is YOU-SEND: RO drafts, you review, you
 * send from your own Gmail (we never send). Voice per ro-voice.html.
 */
type Email = {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  classification?: { category?: string; summary?: string; asks?: string[]; urgency?: string; needs_reply?: boolean };
};
type Reply = { subject?: string; reply?: string; notes?: string };
type Screening = { answer?: string; evidence?: string[]; gap?: string };

export default function RecruiterStudio() {
  const [state, setState] = useState<"loading" | "connect" | "ready" | "error">("loading");
  const [emails, setEmails] = useState<Email[]>([]);
  const [availability, setAvailability] = useState<unknown[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Reply | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Screening | null>(null);
  const [answerFlag, setAnswerFlag] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/recruiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scan" }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.connected === false) setState("connect");
        else {
          setEmails(j.emails ?? []);
          setAvailability(j.availability ?? []);
          setState("ready");
        }
      })
      .catch(() => setState("error"));
  }, []);

  async function connectGoogle() {
    const origin = window.location.origin;
    await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=/studio/recruiter`,
        scopes:
          "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  }

  async function draftReply(e: Email) {
    setOpenId(e.id);
    setDraft(null);
    setBusy(e.id);
    const res = await fetch("/api/recruiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "draft_reply",
        message: `From: ${e.from}\nSubject: ${e.subject}\n\n${e.body}`,
        classification: e.classification,
        availability,
      }),
    });
    const j = await res.json();
    setDraft(j.draft ?? null);
    setBusy(null);
  }

  async function draftScreening() {
    if (question.trim().length < 5) return;
    setBusy("screening");
    setAnswer(null);
    setAnswerFlag(null);
    const res = await fetch("/api/recruiter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "draft_screening", question }),
    });
    const j = await res.json();
    if (j.error) setAnswerFlag(j.error);
    else {
      setAnswer(j.draft ?? null);
      if (j.status === "needs_your_eyes") setAnswerFlag("I flagged this for your eyes — check it traces to your real experience before you use it.");
    }
    setBusy(null);
  }

  function gmailComposeUrl(e: Email, d: Reply) {
    const addr = (e.from.match(/<(.+?)>/)?.[1] ?? e.from).trim();
    const su = d.subject || `Re: ${e.subject}`;
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(addr)}&su=${encodeURIComponent(su)}&body=${encodeURIComponent(d.reply ?? "")}`;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx3">← feed</Link>
        <span className="font-mono text-xs text-tx3">gate 2 · screening &amp; recruiter · auto → you send</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Recruiter desk</h1>
      <p className="mt-2 text-tx2">
        I read what&apos;s in your inbox, draft the replies in your voice, and never commit to a time
        you&apos;re not free. You send everything — nothing leaves without your click.
      </p>

      {state === "loading" && <p className="mt-8 text-sm text-tx3">Reading your inbox…</p>}
      {state === "error" && <p className="mt-8 text-sm text-dng">That didn&apos;t go through on my end — try again in a moment.</p>}

      {state === "connect" && (
        <div className="mt-8 rounded-xl border border-bd bg-surf2 p-6">
          <p className="text-[15px] text-tx">
            To read your recruiter mail and calendar, I need your okay on Google — read-only, and only
            so I can draft replies for you. You still send everything yourself.
          </p>
          <button
            onClick={connectGoogle}
            className="mt-4 rounded-md bg-info px-4 py-2 text-sm font-medium text-white"
          >
            Connect Gmail &amp; Calendar
          </button>
        </div>
      )}

      {state === "ready" && (
        <>
          {/* Screening-answer tool */}
          <section className="mt-8 rounded-xl border border-bd bg-surf p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Screening question</p>
            <p className="mt-1 text-sm text-tx2">Paste an application question — I&apos;ll answer it from your real experience (and flag anything that overstates).</p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder="e.g. Tell us about a time you shipped an AI product under ambiguity."
              className="mt-3 w-full rounded-lg border border-bd bg-surf2 p-3 text-sm text-tx outline-none focus:border-info"
            />
            <button
              onClick={draftScreening}
              disabled={busy === "screening" || question.trim().length < 5}
              className="mt-2 rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {busy === "screening" ? "Drafting…" : "Draft my answer"}
            </button>
            {answerFlag && <p className="mt-2 text-xs text-warn">{answerFlag}</p>}
            {answer?.answer && (
              <div className="mt-3 rounded-lg bg-surf2 p-3">
                <p className="whitespace-pre-wrap text-sm text-tx">{answer.answer}</p>
                {answer.gap && <p className="mt-2 text-xs text-warn">Gap: {answer.gap}</p>}
              </div>
            )}
          </section>

          {/* Inbox */}
          <section className="mt-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-tx3">
              From your inbox {emails.length > 0 && `· ${emails.length} worth a look`}
            </p>
            {emails.length === 0 ? (
              <p className="text-sm text-tx3">Nothing recruiter-shaped in the last 30 days. I&apos;ll keep watch.</p>
            ) : (
              <div className="space-y-3">
                {emails.map((e) => (
                  <article key={e.id} className="rounded-xl border border-bd bg-surf p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-tx">{e.subject || "(no subject)"}</p>
                        <p className="truncate text-xs text-tx3">{e.from}</p>
                      </div>
                      {e.classification?.category && (
                        <span className="shrink-0 rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-semibold uppercase text-info-tx">
                          {e.classification.category}
                        </span>
                      )}
                    </div>
                    {e.classification?.summary && (
                      <p className="mt-2 text-sm text-tx2">{e.classification.summary}</p>
                    )}
                    {e.classification?.needs_reply && (
                      <button
                        onClick={() => draftReply(e)}
                        disabled={busy === e.id}
                        className="mt-3 rounded-md border border-bd px-3 py-1.5 text-xs text-tx2 disabled:opacity-40"
                      >
                        {busy === e.id ? "Drafting…" : "Draft a reply"}
                      </button>
                    )}

                    {openId === e.id && draft?.reply && (
                      <div className="mt-3 rounded-lg border border-bd bg-surf2 p-3">
                        <p className="text-xs font-semibold text-tx">{draft.subject || `Re: ${e.subject}`}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-tx2">{draft.reply}</p>
                        {draft.notes && <p className="mt-2 text-xs text-warn">Before you send: {draft.notes}</p>}
                        <div className="mt-3 flex gap-2">
                          <a
                            href={gmailComposeUrl(e, draft)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Open in Gmail to send ↗
                          </a>
                          <button
                            onClick={() => navigator.clipboard?.writeText(draft.reply ?? "")}
                            className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
