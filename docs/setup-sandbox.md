# Setup — Build-studio live-code sandbox (Gate 3 prototype/MVP canvas)

The document canvases (PRD, case study) are already live. The **clickable
prototype / MVP** canvas — where RO builds runnable code with a live preview —
needs a secure code sandbox. We chose **Cloudflare Sandbox SDK** (see
`sandbox/spike/RECOMMENDATION.md`). It needs two things only you can enable:

## 1 · Docker (for local dev)

The CF Sandbox SDK runs containers locally via Docker during `wrangler dev`.

1. Install **Docker Desktop** → https://www.docker.com/products/docker-desktop/
2. Launch it; wait until the whale icon says "running".
3. Verify in a terminal: `docker info` should print without error.

## 2 · Cloudflare Containers (for production)

Containers is a **paid** Workers feature.

1. Cloudflare dashboard → **Workers & Pages** → **Plans** → ensure **Workers Paid**
   ($5/mo) is active on the account (`430f00d6622c766342f89a4e6a2261f6`).
2. Containers is included with Workers Paid; no separate signup, but the paid
   plan is required.

## 3 · Then tell me — I'll do the rest

Once Docker is running + Workers Paid is on, I will:
1. Run the **deferred 3-point sandbox check** on the spike
   (`cd sandbox/spike/cf-sandbox && npx wrangler dev`): prove egress deny-by-
   default, measure cold-start latency, and record $/build — the gate from
   `architecture.md §10` before building studio UI on it.
2. If it passes, build the **prototype/MVP canvas**: RO writes code into the
   sandbox, returns a live preview URL, enforces runtime/egress/memory caps.
3. **Promote the build session to a Durable Object** (architecture.md §1.2: the
   build-studio DO owns the live sandbox) — the document-canvas logic is
   unchanged; the DO just wraps it and holds the live sandbox. Two-way door.

No code changes needed from you — just the two toggles above.
