"use client";

import { useState } from "react";

/**
 * RoleOS design system — living style guide. Public route (/design). Renders the
 * tokens from app/globals.css so we can *see* and iterate the system, not read
 * hex codes. Toggle switches the dark (marketing) face on. Nothing here is app
 * logic — it's the visual contract. See docs/specs/design-system.md.
 */

function Swatch({ name, varName, hex, tx }: { name: string; varName: string; hex?: string; tx?: string }) {
  return (
    <div className="rounded-lg border border-bd overflow-hidden bg-surf">
      <div className="h-16 w-full" style={{ background: `var(${varName})`, color: tx }} />
      <div className="px-3 py-2">
        <div className="text-small font-semibold text-tx">{name}</div>
        <div className="text-overline font-mono text-tx3">{hex ?? varName}</div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-overline font-semibold uppercase text-tx3" style={{ letterSpacing: "var(--tr-overline)" }}>
        {label}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystem() {
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? "theme-dark" : ""}>
      <div className="min-h-screen bg-bg text-tx font-sans">
        <div className="mx-auto max-w-5xl px-6 py-12 space-y-14">
          {/* Header */}
          <header className="flex items-start justify-between gap-4">
            <div>
              <div className="text-overline font-semibold uppercase text-primary" style={{ letterSpacing: "var(--tr-overline)" }}>
                RoleOS · Design System
              </div>
              <h1 className="font-display text-h1 font-bold text-tx mt-2" style={{ letterSpacing: "var(--tr-display)" }}>
                One system. Two faces.
              </h1>
              <p className="text-tx2 mt-2 max-w-xl">
                Cool neutrals, a grape lead accent, a tidy type &amp; radius scale — OpenRouter&rsquo;s
                discipline in RoleOS&rsquo;s calm voice. Light for the app, dark for the story.
              </p>
            </div>
            <button
              onClick={() => setDark((d) => !d)}
              className="shrink-0 rounded-md border border-bd2 bg-surf px-3 py-2 text-small font-medium text-tx hover:bg-surf2 transition-colors"
            >
              {dark ? "☀ Light (app)" : "☾ Dark (marketing)"}
            </button>
          </header>

          {/* Brand */}
          <Section label="Brand — the identity is six colors">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Swatch name="Ink" varName="--ink" hex="#03080a" />
              <Swatch name="Cloud" varName="--cloud" hex="#fcfcfe" />
              <Swatch name="Grape" varName="--grape" hex="#7624f4" />
              <Swatch name="Volt" varName="--volt" hex="#c8ff00" />
              <Swatch name="Coral" varName="--coral" hex="#ff6849" />
              <Swatch name="Royal" varName="--royal" hex="#035ade" />
            </div>
          </Section>

          {/* Surfaces + text */}
          <Section label="Surfaces & text (revalue per face — names stay)">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Swatch name="bg (page)" varName="--bg" />
              <Swatch name="surf (card)" varName="--surf" />
              <Swatch name="surf2" varName="--surf2" />
              <Swatch name="surf3" varName="--surf3" />
            </div>
            <div className="rounded-lg border border-bd bg-surf p-5 space-y-1">
              <p className="text-tx font-semibold">tx — headings &amp; body. The primary reading color.</p>
              <p className="text-tx2">tx2 — secondary. Supporting copy, descriptions, meta lines.</p>
              <p className="text-tx3">tx3 — faint. Labels, timestamps, the quietest text (still AA).</p>
              <p className="mt-2"><a className="text-link font-medium underline underline-offset-2" href="#">A grape link — RO&rsquo;s voice</a></p>
            </div>
          </Section>

          {/* Type scale */}
          <Section label="Type — Space Grotesk display · Plus Jakarta body">
            <div className="rounded-lg border border-bd bg-surf p-6 space-y-4">
              <p className="font-display text-display font-bold text-tx leading-none" style={{ letterSpacing: "var(--tr-display)" }}>Display 56</p>
              <p className="font-display text-h1 font-bold text-tx" style={{ letterSpacing: "var(--tr-display)" }}>Heading 1 · 36</p>
              <p className="font-display text-h2 font-semibold text-tx">Heading 2 · 24</p>
              <p className="text-h3 font-semibold text-tx">Heading 3 · 20</p>
              <p className="text-body text-tx">Body · 15 / weight 450 — the default reading size. Plus Jakarta Sans, set a touch heavier than normal for a crisp, warm read across long screens like the résumé editor and briefs.</p>
              <p className="text-small text-tx2">Small · 13 — dense UI, table cells, secondary meta.</p>
              <p className="text-overline font-semibold uppercase text-tx3" style={{ letterSpacing: "var(--tr-overline)" }}>Overline · 12 · tracked</p>
              <p className="font-mono text-small text-tx2">Mono · JetBrains — code, tokens, IDs</p>
            </div>
          </Section>

          {/* Buttons */}
          <Section label="Buttons">
            <div className="flex flex-wrap items-center gap-3">
              <button className="rounded-md bg-primary text-primary-tx px-4 py-2 text-small font-semibold hover:bg-primary-hover transition-colors">Primary</button>
              <button className="rounded-md border border-bd2 bg-surf text-tx px-4 py-2 text-small font-semibold hover:bg-surf2 transition-colors">Secondary</button>
              <button className="rounded-md text-primary px-4 py-2 text-small font-semibold hover:bg-primary-bg transition-colors">Ghost</button>
              <button className="rounded-md bg-spark text-spark-ink px-4 py-2 text-small font-bold hover:opacity-90 transition-opacity">Spark CTA</button>
              <button className="rounded-md bg-dng text-white px-4 py-2 text-small font-semibold hover:opacity-90 transition-opacity">Danger</button>
              <button disabled className="rounded-md bg-surf2 text-tx3 px-4 py-2 text-small font-semibold cursor-not-allowed">Disabled</button>
            </div>
          </Section>

          {/* Inputs */}
          <Section label="Inputs">
            <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
              <input placeholder="Default input" className="rounded-md border border-bd2 bg-surf px-3 py-2 text-body text-tx placeholder:text-tx3 focus:outline-none focus:border-primary focus:shadow-ring transition-shadow" />
              <input placeholder="Focus me (grape ring)" className="rounded-md border border-bd2 bg-surf px-3 py-2 text-body text-tx placeholder:text-tx3 focus:outline-none focus:border-primary focus:shadow-ring transition-shadow" />
            </div>
          </Section>

          {/* Badges / states */}
          <Section label="Status — pill · text · faint bg · border, per state">
            <div className="flex flex-wrap gap-2">
              {[
                ["Info", "info"],
                ["Pursue", "suc"],
                ["Aging", "warn"],
                ["Closed", "dng"],
              ].map(([label, k]) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-small font-medium border"
                  style={{ background: `var(--${k}-bg)`, color: `var(--${k}-tx)`, borderColor: `var(--${k}-bd)` }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--${k})` }} />
                  {label}
                </span>
              ))}
            </div>
          </Section>

          {/* Cards + elevation */}
          <Section label="Cards & elevation">
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                ["Flat", "border border-bd"],
                ["Raised", "border border-bd shadow-md"],
                ["Floating", "shadow-lg"],
              ].map(([label, cls]) => (
                <div key={label} className={`rounded-xl bg-surf p-5 ${cls}`}>
                  <div className="text-section font-semibold text-tx">{label} card</div>
                  <p className="text-small text-tx2 mt-1">Radius xl · surface · {label.toLowerCase()} depth. The unit everything sits in.</p>
                  <button className="mt-4 rounded-md bg-primary text-primary-tx px-3 py-1.5 text-small font-semibold">Action</button>
                </div>
              ))}
            </div>
          </Section>

          {/* Radius */}
          <Section label="Radius scale">
            <div className="flex flex-wrap gap-4">
              {[["sm 4", "rounded-sm"], ["md 6", "rounded-md"], ["lg 8", "rounded-lg"], ["xl 12", "rounded-xl"], ["2xl 16", "rounded-2xl"], ["full", "rounded-full"]].map(([label, cls]) => (
                <div key={label} className="text-center space-y-1">
                  <div className={`h-14 w-14 bg-primary-bg border border-primary-bd ${cls}`} />
                  <div className="text-overline font-mono text-tx3">{label}</div>
                </div>
              ))}
            </div>
          </Section>

          <footer className="pt-6 border-t border-bd text-small text-tx3">
            RoleOS design system · tokens in <span className="font-mono">app/globals.css</span> · mapped in <span className="font-mono">tailwind.config.ts</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
