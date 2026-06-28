# Optional — URL→profile scraper (Apify / Bright Data)

The onboarding intake works without this: **paste** and **PDF upload** are the
primary, ToS-clean paths. This optional layer lets a user paste *just* a LinkedIn
URL and have RO fetch the profile automatically. It is **off by default** — it
only switches on when a provider key is set — and lives behind a one-file
`ProfileFetcher` interface (`lib/profile-fetcher.ts`) so the vendor is swappable.

⚠️ Caveat (unchanged): scraping LinkedIn is against their ToS regardless of whose
profile it is (Proxycurl was sued + shut down in 2025). Keep this as a
convenience layer, not the load-bearing path.

The two adapters are written to each provider's documented API shape but are
**unverified against a live account** — confirm the request/response mapping the
first time you add a key (the `profileObjectToText` flattener is deliberately
tolerant of schema differences).

## Activate Apify (recommended — pay-per-use, simplest) — VERIFIED LIVE
Default actor: **`apimaestro/linkedin-profile-detail`** (35M+ runs, ~100% success;
verified end-to-end on 2026-06-27 — nested `basic_info`/`experience`/`education`
shape mapped in `lib/profile-fetcher.ts`).
1. Apify account → **Settings → API & Integrations** → copy the token (`apify_api_…`).
2. Set both secrets:
   ```bash
   printf %s "<apify-token>"                       | npx wrangler secret put APIFY_TOKEN
   printf %s "apimaestro/linkedin-profile-detail"  | npx wrangler secret put APIFY_LINKEDIN_ACTOR
   ```
3. Redeploy (`npm run deploy`). Done — a pasted LinkedIn URL now auto-fetches.

## Activate Bright Data (enterprise, 5k free records/mo) — needs an ACTIVE account
The adapter uses the **synchronous** `/datasets/v3/scrape` endpoint (real-time;
the "LinkedIn people profiles - collect by URL" scraper, dataset id like
`gd_…`). ⚠️ An un-activated account returns **"Customer is not active"** — finish
billing/KYC in the Bright Data console first.
1. Bright Data → the LinkedIn people-profiles scraper → note its **dataset id**
   and an **API token** (Account settings → API tokens).
2. Set both secrets:
   ```bash
   printf %s "<brightdata-token>"  | npx wrangler secret put BRIGHTDATA_TOKEN
   printf %s "gd_xxxxxxxx"         | npx wrangler secret put BRIGHTDATA_DATASET_ID
   ```
3. Redeploy. (Response field-mapping uses the generic flattener — verify it the
   first time it runs on a live, active account.)

If both are configured, Apify wins (simpler sync API). With neither set, a pasted
LinkedIn URL falls back to the honest "paste your text / upload your PDF" message.

For local dev, put the same keys (quoted) in `.dev.vars`.
