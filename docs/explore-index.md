# Spec — public Explore (the Index → RO funnel)

Status: **SPEC** (decisions locked 2026-06-29). Owner: Nik. Turns the marketing
Index's dead-end "See all" buttons into a public, browsable index that's native to
RO — browse → ask RO → share profile → see your fit. The anonymous top-of-funnel.

## Locked decisions (Nik, 2026-06-29)
1. **Lives in the app** (ro.roleos.fyi), as **public/anon** routes. Marketing
   roleos.fyi "See all" deep-links in. NOT static marketing pages.
2. **Full RO integration in v1**: browse + live anon "Ask RO" chat + inline
   personalized fit after profile-share.
3. **Show all roles, curated surfaced first**: rank richly-structured (seed) roles
   above thin ingested (`ats`) ones; badge the difference. (Consistent with the
   "one number" public choice — we show everything, just ordered by quality.)

## Today's dead-ends (what this replaces)
- roleos.fyi "See all companies" = `aria-disabled`; "See all role types" → missing
  `roles/`; `CHAT_ENDPOINT` = null (Ask RO is a stub). App has no anon index pages
  (`/feed` is auth-gated). Anonymous visitors hit a wall at peak curiosity.

## The funnel
```
roleos.fyi (live stats) ──"See all"──▶ ro.roleos.fyi/index   (PUBLIC Explore)
  /index            overview: top companies + role types (live)
  /index/companies  all companies, search/sort
  /index/roles      all role types (archetypes) with counts
  /index/company/[slug]    every posting at a company   ┐ curated-first,
  /index/role/[archetype]  every posting of a type      ┘ badged
  /index/posting/[id]      one role detail
  On every page:
   • "Ask RO about this"  → grounded anon chat (the roles in view)
   • "Share your profile → see your fit"  → onboarding → personalized fit badges
```

## Architecture
- **New route group `app/(public)/index/...`** — additive (new files only → low
  conflict with the actively-developed app). Public, no auth.
- **Data = SSR with the service role.** Pages render server-side reading `roles`
  via `supabaseService()`, so the `roles` RLS (authenticated-only) stays intact and
  pages are public + SEO-indexable. No anon table exposure. Client search/sort runs
  over the SSR'd payload (or a small anon RPC if a view needs live filtering).
  - New `lib/explore.ts`: `listCompanies()`, `listArchetypes()`, `companyRoles(slug)`,
    `archetypeRoles(name)`, `posting(id)` — all curated-first ordered
    (`order by (source='seed') desc, must_haves length desc, fetched_at desc`).
- **Anon "Ask RO" chat** — new `POST /api/index/ask` (no auth, **rate-limited** by
  IP). RAG: embed the question → `match` against `role_embeddings` (scoped to the
  page's company/archetype when present) → answer with Claude, grounded, citing
  postings, honest ("RO answers from what it's read"). Reuses `lib/match.ts` +
  `lib/embeddings.ts` + the agent. Models on `app/api/coach/route.ts`. Always ends
  with the convert nudge ("share your profile to see *your* fit").
- **Fit after profile-share** — "See your fit" → existing onboarding (paste/upload/
  LinkedIn). On return, run `run-match` for the viewed roles → inline fit badges
  (strong / stretch / gap) on the same Explore page the user was on. Ties Explore
  into the real product (match + taste model).
- **Marketing deep-links** — in `Nik_Applying for AI roles/docs`: wire
  `see-all-companies` → `https://ro.roleos.fyi/index/companies`, role types →
  `/index/roles`, treemap/archetype clicks → `/index/company/[slug]` etc. Replaces
  the `askRoAbout` stubs. (Separate repo, Pages deploy.)

## Curated-vs-thin handling
- Order: seed (rich) first, then `ats` by extraction completeness. Badge ingested
  roles ("freshly hunted — lighter detail"). Posting detail shows whatever exists
  (full must_haves for seed; description + partial for ats). Never imply a thin role
  is fully analyzed.

## Phasing
1. **Browse** — `(public)/index` group + `lib/explore.ts` + drill-downs, SSR,
   curated-first, badged. Marketing "See all" deep-links. (Funnel skeleton live.)
2. **Ask RO (anon)** — `/api/index/ask` RAG endpoint + chat UI on Explore pages,
   rate-limited, grounded.
3. **Fit** — profile-share inline → `run-match` → fit badges on the viewed roles.

## Open considerations
- **Abuse/cost**: anon chat needs IP rate-limiting + a hard per-session cap (Claude
  cost + scraping). Cache common questions.
- **SEO**: server-rendered `/index/company/[slug]` etc. are a growth surface — add
  metadata/sitemap. (Could drive organic → RO.)
- **Quality optics**: as YC import balloons `ats` roles, Explore makes uneven
  quality visible; curated-first + badges mitigate, but watch it.
- **Coordination**: app is hot (ingestion, YC, asset-versioning sessions). Keep to
  the new `(public)/index` group + new lib/api files; touch shared files (root nav,
  layout) minimally and flag.
- **Rate-limit store**: reuse existing KV/DO if present, else a simple Supabase
  table with a TTL check.
