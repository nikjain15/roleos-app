# RoleOS build-studio sandbox worker

The standalone worker that runs gate-3 **prototype** builds in an isolated,
DO-owned container and returns a **live preview URL**. The main Next app
(`next dev`) can't host containers, so the sandbox lives here and the app calls
it over HTTP. This is the Durable Object that *owns the sandbox*
(architecture.md §1.2).

Proven in the spike (`sandbox/spike/RECOMMENDATION.md`, 2026-06-27): secure exec
+ live preview URL + caps, on free local Docker.

## Run it locally (dev)

Needs Docker running (`wrangler dev` builds the container image).

```bash
# one-time: stale Docker symlink fix (see HANDOFF.md gotchas)
sudo ln -sf /Applications/Docker.app/Contents/Resources/bin/docker /usr/local/bin/docker

cd sandbox/studio
npm install
npm run dev            # serves on http://localhost:8788
```

Then point the app at it (in `roleos/.env.local` / `.dev.vars`):

```
SANDBOX_URL=http://localhost:8788
```

Without `SANDBOX_URL`, the studio runs in **graceful offline mode** — the
prototype's code is still generated, shown, and gated; only the live preview is
off. Live preview is a bonus, never a hard dependency (`lib/sandbox.ts`).

## API

```
POST /build   { sessionId, files:[{path,content}], limits } -> { previewUrl, coldStartMs, totalMs }
GET  /        health check
```

Preview-subdomain requests (e.g. `http://8080-<session>.localhost:8788/`) are
routed into the container by `proxyToSandbox` — that's what the studio iframe
loads.

## Deploy (prod)

Costs CF Containers usage — enable only when deploying the prototype canvas to
prod (user decision: pay only if it proves out).

```bash
npm run deploy
# then set SANDBOX_URL to the deployed worker URL on the main app
```

## Two-way door

The app talks to this through the `SandboxRuntime` interface in
`lib/sandbox.ts`, so the e2b fallback stays one file away.
