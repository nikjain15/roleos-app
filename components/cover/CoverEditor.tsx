"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";

/**
 * Studio › Cover letter (J10) — review, edit, and approve RO's truth-gated cover
 * letter. Design-system only. Honest by construction: truth flags stay visible
 * until approved, "why this angle" shows RO's reasoning, and nothing here sends —
 * approving just makes the letter yours for the apply bundle.
 */
export interface CoverContent {
  subject: string;
  body: string;
  angle: string | null;
  truthNote: string | null;
}

export default function CoverEditor({
  id,
  applyHref,
  status,
  content,
  truthFlags,
}: {
  id: string;
  applyHref: string | null;
  status: string;
  content: CoverContent;
  truthFlags: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(status !== "approved");
  const [subject, setSubject] = useState(content.subject);
  const [body, setBody] = useState(content.body);

  const approved = status === "approved";

  async function approve() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const changed = body.trim() !== content.body.trim() || subject.trim() !== content.subject.trim();
      const res = await fetch(`/api/artifact/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          changed
            ? { action: "edit", edited: { subject: subject.trim(), body: body.trim(), angle: content.angle } }
            : { action: "approve" },
        ),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setErr(j.error ?? "Couldn't save that.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {truthFlags.length > 0 && (
        <Card elevation="flat" className="border-warn-bd bg-warn-bg">
          <p className="text-small font-semibold text-warn-tx">Check these before you approve:</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-small text-warn-tx">
            {truthFlags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </Card>
      )}

      {content.angle && (
        <Card elevation="flat">
          <p className="text-overline font-semibold uppercase text-tx3">Why this angle</p>
          <p className="mt-1.5 text-small leading-relaxed text-tx2">{content.angle}</p>
          {content.truthNote && <p className="mt-2 text-small text-tx3">{content.truthNote}</p>}
        </Card>
      )}

      <Card elevation="flat">
        <div className="flex items-center justify-between gap-3">
          <p className="text-overline font-semibold uppercase text-tx3">Your letter</p>
          {approved && !editing ? (
            <Badge tone="suc" dot>
              approved · in your apply note
            </Badge>
          ) : (
            <Badge tone={truthFlags.length > 0 ? "warn" : "neutral"} dot>
              {truthFlags.length > 0 ? "needs your eyes" : "draft — make it yours"}
            </Badge>
          )}
        </div>

        {editing ? (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-small font-medium text-tx2">Subject</span>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1.5" />
            </label>
            <label className="block">
              <span className="text-small font-medium text-tx2">Letter — every line yours to change</span>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="mt-1.5" />
            </label>
            <div className="flex items-center gap-3">
              <Button onClick={approve} disabled={busy || body.trim().length < 40}>
                {busy ? "Saving…" : "Approve — use this letter"}
              </Button>
              {approved && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setSubject(content.subject);
                    setBody(content.body);
                  }}
                >
                  cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-small font-medium text-tx">{content.subject}</p>
            <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surf2 p-4 text-small leading-relaxed text-tx2">
              {content.body}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit the letter
              </Button>
              {applyHref && (
                <Link href={applyHref} className="text-small font-medium text-primary hover:underline">
                  Back to apply — you send ↗
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>

      {err && (
        <p className="text-small text-dng" role="alert">
          {err}{" "}
          <button onClick={() => setErr(null)} className="underline">
            dismiss
          </button>
        </p>
      )}
    </div>
  );
}
