# Setup - Build-studio live-code sandbox (Gate 3 prototype/MVP canvas)

> **Status:** The prototype/MVP canvas is **built** (`build_code` skill +
> `sandbox/studio` worker) and the sandbox 3-point check **passed** on free local
> Docker (secure exec + live preview URL + caps). What remains is **prod live
> preview**, which needs **paid Cloudflare Containers**. Without it the canvas runs
> graceful-offline (code shown, no live iframe) - fully functional otherwise.

The document canvases (PRD, case study) are already live. The **clickable
prototype / MVP** canvas - where RO builds runnable code with a live preview -
uses **Cloudflare Sandbox SDK** (see `sandbox/spike/RECOMMENDATION.md`). To turn
on live previews you need:

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

## 3 · Turn on prod live previews (once Workers Paid + Containers are on)

The canvas and sandbox worker are already built. To go live in prod:
1. Deploy the sandbox worker: `cd sandbox/studio && npm install && npm run deploy`
   (needs Workers Paid - the CF registry push fails with `Unauthorized` on Free).
2. Set `SANDBOX_SECRET` on both workers + `SANDBOX_URL` on the main app, then
   `npm run deploy` the app. Preview URLs may need a wildcard custom domain
   (e.g. `sandbox.roleos.fyi`).
3. Verify the live iframe end-to-end (build a prototype in `/studio/build`).

Until then the prototype canvas stays graceful-offline. Local live-preview
verification: fix the Docker PATH symlink, `wrangler dev` the `sandbox/studio`
worker, set `SANDBOX_URL=http://localhost:8788`, rebuild a prototype.
