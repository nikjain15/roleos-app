"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

/**
 * Recovery for a cover letter that errored or came back without a usable body.
 * RO owns it honestly and offers to run it again — a fresh async draft the user
 * kicks off. Human-gated; nothing was sent.
 */
export default function RetryCover({ roleId }: { roleId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function retry() {
    if (busy || !roleId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const j = (await res.json()) as { artifactId?: string; error?: string };
      if (j.artifactId) router.push(`/studio/cover/${j.artifactId}`);
      else setErr(j.error ?? "That didn't take — try once more.");
    } catch {
      setErr("Network hiccup — try once more.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card elevation="flat" className="mt-6 bg-surf2">
      <p className="text-body text-tx">
        RO hit a snag drafting this letter — nothing was sent, and I&apos;m not going to show you a
        half-finished draft. Let me run it again.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={retry} disabled={busy || !roleId}>
          {busy ? "Redrafting…" : "Redraft it"}
        </Button>
        <button onClick={() => router.push("/feed")} className="text-small text-tx3 underline">
          back to feed
        </button>
      </div>
      {err && <p className="mt-3 text-small text-warn-tx">{err}</p>}
    </Card>
  );
}
