# CLAUDE.md

This repository's contributor and agent guidance lives in [AGENTS.md](AGENTS.md).
Read it for setup, testing, conventions, project structure, and PR rules.

## Notes for Claude Code

Run checks sequentially (for example `npm run check`), never concurrently: parallel test and typecheck runs can corrupt `node_modules` in this repo. Never add an outbound send path under `agent/`; the human-gated-outward invariant is enforced by dependency-cruiser (`npm run invariant:imports`) and by `tests/invariants`.
