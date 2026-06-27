# RoleOS — continuation brief (paste into a new chat)

You are the senior engineer continuing **RoleOS** — an AI-first web app where an
agent ("RO") runs a senior (AI/PM) job hunt FOR the user. Work like a 20+yr
full-stack engineer: design before code, proven/boring tech, security + data
model right from day one, thin verifiable slices, no quality compromises.

## STEP 1 — read these before doing anything (absolute paths)
1. `/Users/nikjain/Documents/Applying for AI Roles/roleos-design/architecture.md` — THE CONTRACT (approved). Implement it; flag + ask before diverging.
2. `/Users/nikjain/Documents/Applying for AI Roles/roleos-design/journey.html` — product model.
3. `/Users/nikjain/Documents/Applying for AI Roles/roleos-design/ro-voice.html` — RO's voice; governs EVERY user-facing string (candid-never-cold; no generic SaaS copy).
4. Your auto-memory `MEMORY.md` + linked files (esp. `roleos-phase1.md` = the live build log, `roleos-build-decisions.md`, `roleos-quality-over-time.md`).

## Repo + how to run
- Repo: `/Users/nikjain/Documents/Applying for AI Roles/roleos/` (git; commit per slice, end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).
- Run locally: `cd roleos && npm run dev` → http://localhost:3000 (use the Preview tool: `.claude/launch.json` has `roleos-dev`).
- Secrets are on disk, gitignored: `roleos/.dev.vars` (Worker/scripts) + `roleos/.env.local` (Next dev). Both hold Anthropic + Supabase (url/anon/service_role) + Cloudflare (account id `430f00d6622c766342f89a4e6a2261f6` + Workers AI token). **CLOUDFLARE_API_TOKEN is deliberately NOT in .env.local** (wrangler grabs it for dev and it lacks dev perms; dev uses wrangler OAuth). Supabase project ref `qaubhkrgcdllnqvtrccr`; a Supabase PAT for migrations: ask the user (don't hardcode).

## Stack (don't re-decide — see architecture.md + roleos-build-decisions)
Next.js App Router + TS + Tailwind on Cloudflare via `@opennextjs/cloudflare`. Supabase (Postgres + pgvector + Auth + RLS). Claude via raw Anthropic SDK, tiered (registry: reason=opus-4-8, draft=sonnet-4-6, quick_tag=haiku-4-5, critic=opus). Embeddings = Cloudflare Workers AI `bge` everywhere (no Ollama). Skills = one file each (prompt+model+tools) run by stateless fns; **Durable Objects only for the build-studio sandbox session + a per-user ambient scheduler.**

## INVARIANTS — never break (tests enforce some)
- **Human-gated outward:** NO send tool exists in any skill; sending is a separate user-clicked `app/api/dispatch` route the agent layer can't import. `tests/invariants/no-send-tool.test.ts` + `.dependency-cruiser.cjs` enforce it. Keep them green.
- **Quality gate (judge everything):** every skill output crosses `agent/quality-gate.ts` (shape → guardrails → LLM critic vs ro-voice → revise → tag). Structured (JSON) skills set `structured:true` (skip prose revise). Résumé adds the **truth gate** (claims must trace to master_profile) + truth-driven auto-revise. Role-play personas (mock interviewer) set `gate:'shape_only'`.
- **RLS** is the real boundary; `decision_events` append-only; `profiles.role` immutable by users; `roles`/`role_embeddings` read-only; `agent_runs` admin-only. `taste_model` is a DERIVED projection (confidence + provenance).
- **Quality > latency** (user directive): never trade output quality for speed; optimize latency separately later.

## WHAT'S BUILT + VERIFIED LIVE (Phases 0–3, all local)
- **Foundation:** repo, schema+RLS+auth migrations (applied to live Supabase via `db/seed/apply-migrations.mjs` using a Supabase PAT — no DB password), 557 roles + 557 embeddings seeded, model registry + `callModel` (meters every call to `agent_runs`), `lib/json` tolerant parser, CI + 13 tests.
- **Core slice:** landing → value-first onboarding (`/onboarding`, streaming "watch RO reason" → mirror → matches) → matching (pgvector `match_roles` RPC + Claude reasoning) → auth (magic link + Google code; middleware-gated) → save → **decision feed** (`/feed`).
- **Gate 1** résumé tailoring (`/api/tailor`, `/studio/resume/[id]`) + **truth gate** + truth-driven auto-revise.
- **Taste model** (the moat): `lib/taste.ts` projectTaste — decision_events → inferences w/ confidence+provenance.
- **Gate 3 build studio (document canvas)** `/studio/build`: 8-phase co-creation, inject-your-edge interview, RO-as-adversary pressure-test, **enforced authenticity gate** (no 100%-RO submit; blocked < 20% your-thinking).
- **Gate 4 coach** `/studio/coach`: prep (intel+predicted Qs+story-gap map) + multi-turn mock (RO as interviewer) + debrief.
- **Gate 5 negotiation** `/studio/negotiate`: benchmark + lever scenarios + drafted counter (you-send gated).
- **Sandbox proven (FREE):** the deferred 3-point check passed on local Docker (`sandbox/spike/cf-sandbox` via `wrangler dev`): secure exec + live preview URL + caps. See `sandbox/spike/RECOMMENDATION.md`.

## NOT DEPLOYED
The app has **never been deployed to Cloudflare** — it only runs via `next dev`. Only the Supabase data layer is live/cloud. Deployment is a distinct remaining task (below).

## REMAINING WORK (suggested order)
1. **Build-studio prototype/MVP canvas (gate 3, last piece).** Sandbox is de-risked. Plan: (a) `build_code` skill — RO generates a runnable multi-file project from the bet + edge (pure skill, low-risk); (b) the build-studio **sandbox as its own small worker** (Sandbox DO + container, runs via `wrangler dev` + Docker) that the main Next app calls over HTTP — this IS the DO that "owns the sandbox" (architecture §1.2; main app on `next dev` can't host containers directly); (c) studio "prototype" canvas type = generated code + live-preview iframe, same provenance + authenticity gate. User will pay for CF Containers only when deploying to prod, if it proves out.
2. **Gate 2 — screening/recruiter + real Gmail/Calendar (Flag C).** Needs the user to do `docs/setup-google.md` (Google OAuth client + Supabase Google provider + scopes). Then read recruiter mail + calendar via the provider token, draft screening answers + replies (you-send gated). Google sign-in is currently NOT enabled (magic link works).
3. **Deploy to Cloudflare (prod).** `opennextjs-cloudflare build && deploy`; set secrets via `wrangler secret`; configure Supabase auth redirect URLs for the prod domain; smoke-test. (roleos.fyi is the intended domain.)
4. **Phase 4:** admin dashboards (agent_runs costs / evals / quality pass-rates — data already flowing), notifications + quiet hours (4 tiers, journey §10), ambient agent (per-user DO alarm).
5. **Phase 5:** RLS audit, a11y, perf, harden the invariant tests.

## KNOWN GOTCHAS (learned this session)
- **Run checks SEQUENTIALLY**, not many concurrent npm/vitest/tsc — concurrency corrupted `node_modules` (picomatch `parse.fastpaths` / "Class extends undefined" crashes). Fix if it recurs: `npm ci`. `tsc` is slow (~30–60s) on this codebase; be patient, don't assume a hang.
- **Live-testing an authenticated flow without email:** forge a Supabase session — `admin.generateLink({type:'magiclink',email})` → `verifyOtp({token_hash,type:'email'})` → set cookie `sb-<ref>-auth-token=base64-<base64(session JSON)>`; inject via the Preview tool or curl `Cookie:` header. **Delete the test user after** (`admin.deleteUser` cascades). Use email `ro.tester@roleos.dev`.
- **Preview tool controlled-input quirk:** `preview_fill` doesn't always update React state — set value via the native setter + dispatch an `input` event, or click the page's own "use a sample" buttons.
- **Latency:** the résumé tailor is ~5 model calls / ~150s; coach/negotiate ~30–60s. Accepted (quality-first). Don't "fix" by cutting model tier/effort/gates.
- **Docker:** installed at `/Applications/Docker.app` (CLI at `…/Contents/Resources/bin/docker`); `/usr/local/bin/docker` symlink is stale — user runs `sudo ln -sf /Applications/Docker.app/Contents/Resources/bin/docker /usr/local/bin/docker`. The sandbox needs `wrangler dev` (not `next dev`) + Docker on PATH.

## HOW TO PROCEED
Confirm with the user what to tackle first (recommend: the prototype canvas, since it's the last Phase-3 build and now de-risked — or deployment if they want it live). Build thin verifiable slices, verify live, run checks (sequentially) green, commit each slice, update memory, and PAUSE at checkpoints for review.
