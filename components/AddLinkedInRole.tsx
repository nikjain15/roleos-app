"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bring your own role — paste a job found on LinkedIn (or anywhere) and go
 * straight to a tailored résumé. Two calls: /api/roles/add structures + saves
 * the role privately, then /api/tailor opens the studio on a drafting
 * placeholder (same async flow as TailorButton). Human-gated as ever: RO
 * drafts, the user reviews and sends.
 */
export default function AddLinkedInRole() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<false | "adding" | "tailoring">(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(tailor: boolean) {
    if (busy) return;
    setBusy("adding");
    setErr(null);
    try {
      const res = await fetch("/api/roles/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          company: company.trim(),
          description: description.trim(),
          ...(url.trim() ? { url: url.trim() } : {}),
        }),
      });
      const j = (await res.json()) as { roleId?: string; error?: string };
      if (!j.roleId) {
        setErr(j.error ?? "couldn't add that role — check the fields and try again");
        return;
      }
      if (!tailor) {
        router.refresh();
        setOpen(false);
        setUrl("");
        setTitle("");
        setCompany("");
        setDescription("");
        return;
      }
      setBusy("tailoring");
      const t = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: j.roleId }),
      });
      const tj = (await t.json()) as { artifactId?: string; error?: string };
      if (tj.artifactId) {
        router.push(`/studio/resume/${tj.artifactId}`);
        return;
      }
      // Role saved but tailoring couldn't start (e.g. no master profile yet).
      setErr(tj.error ? `role saved — but tailoring didn't start: ${tj.error}` : "role saved — tailoring didn't start");
      router.refresh();
    } catch {
      setErr("something went wrong — try again");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-bd bg-surf2 px-3 py-1.5 text-xs font-medium text-tx2"
      >
        + Add a role from LinkedIn
      </button>
    );
  }

  const ready = title.trim().length >= 2 && company.trim().length >= 1 && description.trim().length >= 80;

  return (
    <div className="rounded-lg border border-bd bg-surf2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Add a role you found</h2>
        <button onClick={() => setOpen(false)} className="text-xs text-tx3">
          close
        </button>
      </div>
      <p className="mt-1 text-xs text-tx3">
        Paste the posting from LinkedIn (or anywhere). RO structures it and tailors your résumé against
        it — the role stays private to you.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Role title"
          className="rounded-md border border-bd bg-bg px-3 py-2 text-sm"
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          className="rounded-md border border-bd bg-bg px-3 py-2 text-sm"
        />
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="linkedin.com/jobs/view/… (optional)"
        className="mt-2 w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Paste the full job description here"
        rows={6}
        className="mt-2 w-full rounded-md border border-bd bg-bg px-3 py-2 text-sm"
      />
      {description.trim().length > 0 && description.trim().length < 80 && (
        <p className="mt-1 text-xs text-tx3">paste the full description — a title alone isn&apos;t enough to tailor honestly</p>
      )}
      {err && <p className="mt-2 text-xs text-warn">{err}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => submit(true)}
          disabled={!ready || !!busy}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-70"
        >
          {busy === "adding" ? "Adding…" : busy === "tailoring" ? "Opening studio…" : "Add & tailor my résumé →"}
        </button>
        <button
          onClick={() => submit(false)}
          disabled={!ready || !!busy}
          className="text-xs text-tx2 disabled:opacity-70"
        >
          just add to my workspace
        </button>
      </div>
    </div>
  );
}
