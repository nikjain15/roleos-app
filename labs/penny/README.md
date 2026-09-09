# Penny: an AI-native financial coaching prototype

A working prototype and its design artifacts: an AI-native coach that helps early- and
mid-career customers plan, decide, and act.

- `wireframes/`: low-fidelity user journey and phone wireframes as design-canvas artboards
  (`*.dc.html` plus `canvas.json`). The assembled canvas is published as a Claude artifact
  and is not committed (it embeds a 2 MB editor payload).

Concept only, built on synthetic data. Not a product, and not financial advice.
No third-party trademarks or data are used.

- `app/index.html`: the working prototype, one self-contained page. Persona picker, the Penny
  thread with deterministic calculators behind every number, a visible specialist team on every
  tool call, permission prompts before any action, a time-jump for the between-sessions turns,
  the Money, Plan, Activity, and You tabs, and a "How this works" column written for
  someone exploring the link alone: vision, personas, the eight-agent architecture and how
  one turn flows through it, what memory holds between sessions, design principles, the
  coaching voice, guardrails and metrics. Free-text replies use
  the artifact runtime's Claude access when available and a scripted fallback otherwise; both are
  labelled, and a live reply is held and replaced by the scripted one if it names a product, uses
  guarantee language, or quotes a number Planner did not produce.
  Published as a Claude artifact; open the file directly in a browser for a local run.
- `AUDIT.md`: the pre-demo audit this build was corrected against, and what changed.

## Design

Responsive from 360px to desktop: the frame is fluid (`dvh`-based, so mobile browser
chrome never crops the tab bar), the notes column moves below the phone under 900px,
and the phone goes full-bleed under 560px.

The prototype uses the RoleOS design system's neutral ramp, type scale, radii and
shadows, with a finance-calm accent set: royal `#035ADE` leads, no volt.

Charts use a two-slot categorical palette, `#035ADE` and `#B26A00`, validated together
on white — CVD ΔE 30.5, normal-vision ΔE 35.2, both ≥3:1 on the surface. Two slots is
the whole set because no chart here plots more than two series; the slots are assigned
in fixed order and never cycled. Magnitude (spending, goal progress) is a single-hue
sequential ramp; `--good` and `--danger` are reserved for status and always ship with a
label or icon, never colour alone.
