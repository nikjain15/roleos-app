# Gate-3 sandbox spike — CF Sandbox SDK vs e2b

architecture.md §10. Build the **same tiny target** on both runtimes, score, recommend.
This directory is isolated from the app build (excluded in tsconfig + .gitignore).

## The common target (identical on both)

A function `runBuild(files, entry)` that:

1. spins a fresh runtime,
2. writes an untrusted multi-file project (a tiny Vite/React app),
3. installs deps + starts a dev server,
4. returns a **live preview URL**,
5. enforces **runtime timeout + egress allowlist + memory cap**,
6. tears down and records **wall-clock + $ per build**.

Both implement `SandboxRuntime` (see `target.ts`) so scoring is apples-to-apples.

## Scoring rubric (architecture.md §10)

| Criterion | Weight | What we measure |
|---|---|---|
| Isolation strength | ×3 | VM vs container; can untrusted code touch the host / other tenants? |
| Preview latency | ×2 | cold-start → first byte from the preview URL |
| Egress control | ×3 | can we deny-by-default and allowlist hosts? |
| Cost / build | ×2 | $ for a representative 60s build session |
| CF-integration fit | ×2 | bindings, DO ownership, secrets, one deploy target |

## Status

- `target.ts` — the shared interface + the test project + the rubric harness.
- `cf-sandbox/` — Cloudflare Sandbox SDK implementation (runnable; needs Docker
  locally / Containers on deploy).
- `e2b/` — e2b implementation (runnable; needs `E2B_API_KEY`).
- `RECOMMENDATION.md` — the writeup + the call. **Phase-1 checkpoint item.**

Running the live comparison needs a CF account with Containers enabled and an
e2b key — see RECOMMENDATION.md for which numbers are proven vs. pending those.
