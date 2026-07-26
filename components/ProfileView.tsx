"use client";

import { useState } from "react";
import type { CanonicalProfile, ProfileSource } from "@/lib/profile-schema";
import type { EditableField, ProfileEdit } from "@/lib/profile-events";

/**
 * P2 — "What RO knows about you" (docs/specs/profile-data-layer.md). Shows the
 * structured, provenanced profile and lets the user fix any fact. Every edit POSTs
 * to /api/profile/edit → updates the stored profile AND logs a high-weight taste
 * signal. Built on the design system. Corrections are the moat's best fuel.
 */

const SOURCE_LABEL: Record<ProfileSource, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  resume: "résumé",
  user: "you",
};

function SourceBadge({ source }: { source: ProfileSource }) {
  return (
    <span className="rounded bg-surf2 px-1.5 py-0.5 text-overline text-tx3" title={`from ${SOURCE_LABEL[source]}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

export default function ProfileView({ initial }: { initial: CanonicalProfile }) {
  const [profile, setProfile] = useState<CanonicalProfile>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function edit(body: ProfileEdit, key: string) {
    setBusy(key);
    setErr(null);
    try {
      const res = await fetch("/api/profile/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; profile?: CanonicalProfile; error?: string };
      if (res.ok && data.profile) setProfile(data.profile);
      else setErr(data.error ?? "That didn't save — try again.");
    } catch {
      setErr("Network hiccup — try again.");
    } finally {
      setBusy(null);
    }
  }

  const { identity, signals, skills, experience, education, projects } = profile;
  const target = signals.target;

  return (
    <div className="space-y-8">
      {err && <p className="text-small text-dng">{err}</p>}

      {/* Identity */}
      <section>
        <h2 className="font-display text-h3 font-semibold text-tx">You, in RO's words</h2>
        <div className="mt-3 space-y-2">
          <EditableRow
            label="Name" value={identity.name?.value} source={identity.name?.source}
            busy={busy === "name"} onSave={(to) => edit({ op: "correct", field: "name", to }, "name")}
          />
          <EditableRow
            label="Headline" value={identity.headline?.value} source={identity.headline?.source}
            busy={busy === "headline"} onSave={(to) => edit({ op: "correct", field: "headline", to }, "headline")}
          />
          <EditableRow
            label="Location" value={identity.location?.value} source={identity.location?.source}
            busy={busy === "location"} onSave={(to) => edit({ op: "correct", field: "location", to }, "location")}
          />
        </div>
      </section>

      {/* Target */}
      <section>
        <h2 className="font-display text-h3 font-semibold text-tx">What you&rsquo;re after</h2>
        <div className="mt-3 space-y-2">
          <EditableRow label="Role" value={target?.role} busy={busy === "target.role"} onSave={(to) => edit({ op: "correct", field: "target.role", to }, "target.role")} />
          <EditableRow label="Level" value={target?.level} busy={busy === "target.level"} onSave={(to) => edit({ op: "correct", field: "target.level", to }, "target.level")} />
          <EditableRow label="Pay" value={target?.comp} busy={busy === "target.comp"} onSave={(to) => edit({ op: "correct", field: "target.comp", to }, "target.comp")} />
          <EditableRow label="Location" value={target?.location} busy={busy === "target.location"} onSave={(to) => edit({ op: "correct", field: "target.location", to }, "target.location")} />
        </div>
      </section>

      {/* Skills */}
      {skills.length > 0 && (
        <section>
          <h2 className="font-display text-h3 font-semibold text-tx">Skills RO sees</h2>
          <p className="mt-1 text-small text-tx3">Tap ✗ on anything that isn&rsquo;t you — I&rsquo;ll drop it and remember.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {skills.map((s) => (
              <span key={s.canonical} className="inline-flex items-center gap-1.5 rounded-full border border-bd bg-surf px-3 py-1 text-small text-tx">
                {s.canonical}
                <SourceBadge source={s.source} />
                <button
                  aria-label={`Remove ${s.canonical}`}
                  disabled={busy === `skill:${s.canonical}`}
                  onClick={() => edit({ op: "reject", field: "skill", value: s.canonical }, `skill:${s.canonical}`)}
                  className="text-tx3 transition-colors hover:text-dng disabled:opacity-40"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Experience (read-only) */}
      {experience.length > 0 && (
        <section>
          <h2 className="font-display text-h3 font-semibold text-tx">Experience</h2>
          <div className="mt-3 space-y-3">
            {experience.map((e, i) => (
              <div key={i} className="rounded-xl bg-surf p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-tx">{e.title} <span className="font-normal text-tx2">· {e.company}</span></p>
                  <div className="flex shrink-0 items-center gap-2">
                    {(e.start || e.end) && <span className="text-overline text-tx3">{[e.start, e.end].filter(Boolean).join(" – ")}</span>}
                    <SourceBadge source={e.source} />
                  </div>
                </div>
                {e.highlights.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {e.highlights.map((h, j) => <li key={j} className="text-small leading-relaxed text-tx2">{h}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Projects (read-only) */}
      {projects.length > 0 && (
        <section>
          <h2 className="font-display text-h3 font-semibold text-tx">Things you&rsquo;ve built</h2>
          <div className="mt-3 space-y-2">
            {projects.map((p, i) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-xl bg-surf p-3.5 shadow-sm">
                <div className="min-w-0">
                  <p className="font-medium text-tx">{p.name} {p.tech.length > 0 && <span className="text-small text-tx3">· {p.tech.join(", ")}</span>}</p>
                  {p.description && <p className="mt-0.5 text-small text-tx2">{p.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {typeof p.stars === "number" && p.stars > 0 && <span className="text-overline text-tx3">★{p.stars}</span>}
                  <SourceBadge source={p.source} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education (read-only) */}
      {education.length > 0 && (
        <section>
          <h2 className="font-display text-h3 font-semibold text-tx">Education</h2>
          <div className="mt-3 space-y-1.5">
            {education.map((e, i) => (
              <p key={i} className="text-body text-tx2">
                <span className="font-medium text-tx">{e.school}</span>{e.degree ? ` — ${e.degree}` : ""}{e.field ? `, ${e.field}` : ""}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EditableRow({
  label,
  value,
  source,
  busy,
  onSave,
}: {
  label: string;
  value?: string;
  source?: ProfileSource;
  busy: boolean;
  onSave: (to: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");

  return (
    <div className="flex items-start gap-3 rounded-xl bg-surf px-4 py-2.5 shadow-sm">
      <span className="mt-0.5 w-20 shrink-0 text-small text-tx3">{label}</span>
      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onSave(text.trim()); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
            className="flex-1 rounded-md border border-bd bg-surf2 px-2.5 py-1.5 text-body text-tx outline-none focus:border-primary focus:shadow-ring"
          />
          <button
            disabled={busy || !text.trim()}
            onClick={() => { onSave(text.trim()); setEditing(false); }}
            className="rounded-md bg-primary px-3 py-1.5 text-small font-medium text-white disabled:opacity-40"
          >
            {busy ? "…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="text-small text-tx3 hover:text-tx2">cancel</button>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-between gap-3">
          <span className={value ? "text-body text-tx" : "text-body italic text-tx3"}>{value ?? "not set"}</span>
          <div className="flex shrink-0 items-center gap-2">
            {source && <SourceBadge source={source} />}
            <button onClick={() => { setText(value ?? ""); setEditing(true); }} className="text-small text-primary hover:underline">edit</button>
          </div>
        </div>
      )}
    </div>
  );
}
