"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";

/**
 * Cover-letter summary on the Apply page (J10). The full editor now lives in
 * Studio (/studio/cover/[id]); this card starts an async draft (instant — RO
 * drafts while you watch in the studio) or summarizes the letter's state with a
 * link in. Human-gated: drafting and approving are user clicks; nothing sends.
 */
export interface CoverArtifact {
  id: string;
  status: string;
  subject: string;
  body: string;
  angle: string | null;
  truthFlags: string[];
}

const STATUS_BADGE: Record<string, { tone: "neutral" | "suc" | "warn" | "primary" | "dng"; label: string }> = {
  approved: { tone: "suc", label: "approved · in your note" },
  needs_your_eyes: { tone: "warn", label: "needs your eyes" },
  draft: { tone: "primary", label: "drafted — make it yours" },
  drafting: { tone: "primary", label: "RO is writing it…" },
  error: { tone: "dng", label: "hit a snag" },
};

export default function CoverLetterCard({ roleId, cover }: { roleId: string; cover: CoverArtifact | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function draft() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const j = (await res.json()) as { artifactId?: string; error?: string };
      if (res.ok && j.artifactId) {
        router.push(`/studio/cover/${j.artifactId}`);
      } else {
        setErr(j.error ?? "Couldn't start the letter.");
        setBusy(false);
      }
    } catch {
      setErr("Couldn't reach the server.");
      setBusy(false);
    }
  }

  const badge = cover ? (STATUS_BADGE[cover.status] ?? STATUS_BADGE.draft) : null;

  return (
    <Card elevation="flat">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-overline font-semibold uppercase text-tx3">Cover letter</h2>
        {badge && (
          <Badge tone={badge.tone} dot>
            {badge.label}
          </Badge>
        )}
      </div>

      {!cover || cover.status === "error" ? (
        <>
          <p className="mt-2 text-small leading-relaxed text-tx2">
            Your note below is a clean template. I can draft a real letter for this role from your
            profile — truth-gated, and you approve it before it goes anywhere.
          </p>
          <Button onClick={draft} disabled={busy} className="mt-3">
            {busy ? "Starting…" : cover ? "Draft it again" : "Draft my cover letter"}
          </Button>
        </>
      ) : (
        <>
          {cover.angle && <p className="mt-2 text-small text-tx3">Angle: {cover.angle}</p>}
          {cover.body && cover.status !== "drafting" && (
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-small leading-relaxed text-tx2">{cover.body}</p>
          )}
          {cover.truthFlags.length > 0 && (
            <p className="mt-2 text-small text-warn-tx">
              {cover.truthFlags.length} thing{cover.truthFlags.length === 1 ? "" : "s"} to check before you approve.
            </p>
          )}
          <div className="mt-3">
            <Link href={`/studio/cover/${cover.id}`} className="text-small font-medium text-primary hover:underline">
              {cover.status === "drafting"
                ? "Watch RO write it →"
                : cover.status === "approved"
                  ? "Open in Studio — edit or review →"
                  : "Review it in Studio — you approve →"}
            </Link>
          </div>
        </>
      )}

      {err && (
        <p className="mt-3 text-small text-dng" role="alert">
          {err}{" "}
          <button onClick={() => setErr(null)} className="underline">
            dismiss
          </button>
        </p>
      )}
    </Card>
  );
}
