# Penny: AI-native financial coaching prototype (Fidelity Labs concept)

A working prototype and its design artifacts for a Head of Product application:
an AI-native coach that helps early- and mid-career customers plan, decide, and act.

- `wireframes/`: low-fidelity user journey and phone wireframes as design-canvas artboards
  (`*.dc.html` plus `canvas.json`). The assembled canvas is published as a Claude artifact
  and is not committed (it embeds a 2 MB editor payload).

Concept only. Not a Fidelity product; no Fidelity trademarks or data are used.

- `app/index.html`: the working prototype, one self-contained page. Persona picker, the Penny
  thread with deterministic calculators behind every number, a visible specialist team on every
  tool call, permission prompts before any action, a time-jump for the between-sessions turns,
  the Money, Plan, Activity, and You tabs, and the product-notes column. Free-text replies use
  the artifact runtime's Claude access when available and a scripted fallback otherwise; both are
  labelled, and a live reply is held and replaced by the scripted one if it names a product, uses
  guarantee language, or quotes a number Planner did not produce.
  Published as a Claude artifact; open the file directly in a browser for a local run.
- `AUDIT.md`: the pre-demo audit this build was corrected against, and what changed.
