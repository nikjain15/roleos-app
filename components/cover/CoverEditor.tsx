"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { parseCoverDoc, compileBody, toContent, COVER_TUNE_PRESETS, type CoverDoc } from "@/lib/cover/doc";

/**
 * Studio › Cover letter (J10.2) — the SECTIONED editor. Four sections with jobs
 * (opening · why them · why you · closing), each with: inline edit, ✓-keep lock,
 * "Why RO wrote this", one-tap tune presets AND a freeform "tell RO how" — every
 * tune truth-gated + scope/lock-enforced server-side. Legacy flat letters render
 * as one section (re-draft for the full structure). Approving compiles sections
 * into the flat body the apply bundle uses. Nothing here sends.
 */
export default function CoverEditor({
  id,
  roleId,
  applyHref,
  status: initialStatus,
  content,
  truthFlags,
}: {
  id: string;
  roleId: string | null;
  applyHref: string | null;
  status: string;
  content: unknown;
  truthFlags: string[];
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<CoverDoc>(() => parseCoverDoc(content));
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<string | null>(null); // sectionId | "approve" | null
  const [err, setErr] = useState<string | null>(null);
  const [openRationale, setOpenRationale] = useState<string | null>(null);
  const [tuneText, setTuneText] = useState<Record<string, string>>({});
  const [tuneNote, setTuneNote] = useState<{ sectionId: string; note: string; flags: string[] } | null>(null);
  const [preview, setPreview] = useState(false);

  const approved = status === "approved";
  const legacy = doc.sections.length === 1 && doc.sections[0]?.id === "letter";

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/artifact/${id}/cover-tune`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { ok?: boolean; status?: string; error?: string };
    if (res.ok && j.ok) {
      if (j.status) setStatus(j.status);
      return true;
    }
    setErr(j.error ?? "Couldn't save that.");
    return false;
  }

  function setSection(sectionId: string, up: Partial<{ text: string; locked: boolean }>) {
    setDoc((d) => ({ ...d, sections: d.sections.map((s) => (s.id === sectionId ? { ...s, ...up } : s)) }));
  }

  async function toggleKeep(sectionId: string, locked: boolean) {
    setSection(sectionId, { locked });
    await patch({ sections: [{ id: sectionId, locked }] });
  }

  async function tune(sectionId: string, instruction: string) {
    if (!instruction.trim() || busy) return;
    setBusy(sectionId);
    setErr(null);
    setTuneNote(null);
    try {
      const res = await fetch(`/api/artifact/${id}/cover-tune`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, instruction: instruction.trim() }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        status?: string;
        content?: unknown;
        note?: string;
        flags?: string[];
        error?: string;
      };
      if (res.ok && j.ok && j.content) {
        setDoc(parseCoverDoc(j.content));
        if (j.status) setStatus(j.status);
        setTuneNote({ sectionId, note: j.note ?? "Tuned.", flags: j.flags ?? [] });
        setTuneText((t) => ({ ...t, [sectionId]: "" }));
      } else {
        setErr(j.error ?? "Couldn't tune that section.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  // Legacy (pre-sections) letters: start a fresh async draft to get the four
  // sections. The old letter stays until the new one lands (human-gated).
  async function redraft() {
    if (busy || !roleId) return;
    setBusy("redraft");
    setErr(null);
    try {
      const res = await fetch("/api/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const j = (await res.json()) as { artifactId?: string; error?: string };
      if (res.ok && j.artifactId) router.push(`/studio/cover/${j.artifactId}`);
      else {
        setErr(j.error ?? "Couldn't start a fresh draft.");
        setBusy(null);
      }
    } catch {
      setErr("Couldn't reach the server.");
      setBusy(null);
    }
  }

  async function approve() {
    if (busy) return;
    setBusy("approve");
    setErr(null);
    try {
      const res = await fetch(`/api/artifact/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", edited: toContent(doc) }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setStatus("approved");
        router.refresh();
      } else {
        setErr(j.error ?? "Couldn't save that.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const keptCount = doc.sections.filter((s) => s.locked).length;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {approved ? (
          <Badge tone="suc" dot>
            approved · in your apply note
          </Badge>
        ) : (
          <Badge tone={truthFlags.length > 0 ? "warn" : "primary"} dot>
            {truthFlags.length > 0 ? "needs your eyes" : "draft — make it yours"}
          </Badge>
        )}
        <span className="text-small text-tx3">
          {doc.sections.length} section{doc.sections.length === 1 ? "" : "s"}
          {keptCount > 0 && ` · ${keptCount} kept`}
        </span>
        {legacy && roleId && (
          <button
            onClick={redraft}
            disabled={!!busy}
            className="text-small font-medium text-primary hover:underline disabled:opacity-50"
          >
            {busy === "redraft" ? "starting…" : "drafted before sections — draft a fresh sectioned letter →"}
          </button>
        )}
      </div>

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

      {doc.angle && (
        <Card elevation="flat">
          <p className="text-overline font-semibold uppercase text-tx3">Why this angle</p>
          <p className="mt-1.5 text-small leading-relaxed text-tx2">{doc.angle}</p>
          {doc.truthNote && <p className="mt-2 text-small text-tx3">{doc.truthNote}</p>}
        </Card>
      )}

      <Card elevation="flat">
        <label className="block">
          <span className="text-small font-medium text-tx2">Subject</span>
          <Input
            value={doc.subject}
            onChange={(e) => setDoc((d) => ({ ...d, subject: e.target.value }))}
            onBlur={() => patch({ subject: doc.subject })}
            className="mt-1.5"
          />
        </label>
      </Card>

      {doc.sections.map((section, i) => (
        <Card key={section.id} elevation="flat" className={section.locked ? "border-suc-bd" : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-overline font-semibold uppercase text-tx3">
              {doc.sections.length > 1 ? `${i + 1} · ` : ""}
              {section.label}
            </p>
            <div className="flex items-center gap-2">
              {section.rationale && (
                <button
                  onClick={() => setOpenRationale((o) => (o === section.id ? null : section.id))}
                  aria-expanded={openRationale === section.id}
                  className="text-small text-tx3 hover:text-tx2"
                >
                  Why RO wrote this ✎
                </button>
              )}
              {section.locked ? (
                <Badge tone="suc" dot>
                  <button onClick={() => toggleKeep(section.id, false)}>kept · unlock</button>
                </Badge>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => toggleKeep(section.id, true)}>
                  ✓ keep
                </Button>
              )}
            </div>
          </div>

          {openRationale === section.id && (
            <p className="mt-2 rounded-lg bg-surf2 px-3 py-2 text-small leading-relaxed text-tx2">{section.rationale}</p>
          )}

          {section.locked ? (
            <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surf2 p-3 text-small leading-relaxed text-tx2">
              {section.text}
            </p>
          ) : (
            <>
              <Textarea
                value={section.text}
                onChange={(e) => setSection(section.id, { text: e.target.value })}
                onBlur={() => patch({ sections: [{ id: section.id, text: section.text }] })}
                rows={Math.max(3, Math.ceil(section.text.length / 90))}
                className="mt-3"
              />

              {busy === section.id ? (
                <p className="mt-3 flex items-center gap-2 text-small text-tx2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-bd border-t-primary" />
                  RO is tuning this section — truth-checked, a few seconds…
                </p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-small text-tx3">Tune:</span>
                    {(COVER_TUNE_PRESETS[section.id] ?? COVER_TUNE_PRESETS.letter).map((p) => (
                      <button
                        key={p}
                        onClick={() => tune(section.id, p)}
                        disabled={!!busy}
                        className="rounded-full border border-bd px-2.5 py-1 text-small text-tx2 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={tuneText[section.id] ?? ""}
                      onChange={(e) => setTuneText((t) => ({ ...t, [section.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && tune(section.id, tuneText[section.id] ?? "")}
                      placeholder="Or tell RO how — 'mention their YC batch, drop the buzzwords'"
                      className="text-small"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => tune(section.id, tuneText[section.id] ?? "")}
                      disabled={!!busy || !(tuneText[section.id] ?? "").trim()}
                    >
                      Tune
                    </Button>
                  </div>
                </>
              )}

              {tuneNote?.sectionId === section.id && (
                <div className="mt-2 rounded-lg bg-primary-bg px-3 py-2 text-small">
                  <p className="text-primary">{tuneNote.note}</p>
                  {tuneNote.flags.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-warn-tx">
                      {tuneNote.flags.map((f, j) => (
                        <li key={j}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={approve} disabled={!!busy || compileBody(doc).trim().length < 40}>
          {busy === "approve" ? "Saving…" : approved ? "Save changes — keep it approved" : "Approve — use this letter"}
        </Button>
        <Button variant="ghost" onClick={() => setPreview((p) => !p)}>
          {preview ? "Hide the full letter" : "Preview the full letter"}
        </Button>
        {applyHref && (
          <Link href={applyHref} className="ml-auto text-small font-medium text-primary hover:underline">
            Back to apply — you send ↗
          </Link>
        )}
      </div>

      {preview && (
        <Card elevation="flat">
          <p className="text-small font-medium text-tx">{doc.subject}</p>
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surf2 p-4 text-small leading-relaxed text-tx2">
            {compileBody(doc)}
          </p>
        </Card>
      )}

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
