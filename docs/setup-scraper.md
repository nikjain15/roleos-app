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

## Activate Apify (recommended — pay-per-use, simplest)
1. Create an Apify account → **Settings → Integrations → API token**.
2. Pick a LinkedIn profile actor from the Apify Store (e.g. a "LinkedIn Profile
   Scraper") and note its slug, formatted `owner~actor-name`.
3. Set both secrets:
   ```bash
   printf %s "<apify-token>"            | npx wrangler secret put APIFY_TOKEN
   printf %s "owner~linkedin-actor"     | npx wrangler secret put APIFY_LINKEDIN_ACTOR
   ```
4. Redeploy (`npm run deploy`). Done — a pasted LinkedIn URL now auto-fetches.

## Activate Bright Data (enterprise, 5k free records/mo)
1. Bright Data → create a **LinkedIn Profile** dataset (Web Scraper API) → note
   the **dataset id** and an **API token**.
2. Set both secrets:
   ```bash
   printf %s "<brightdata-token>"  | npx wrangler secret put BRIGHTDATA_TOKEN
   printf %s "<dataset-id>"        | npx wrangler secret put BRIGHTDATA_DATASET_ID
   ```
3. Redeploy. (Bright Data is async — the adapter triggers a snapshot and polls up
   to ~45s, within the onboard request's 60s ceiling.)

If both are configured, Apify wins (simpler sync API). With neither set, a pasted
LinkedIn URL falls back to the honest "paste your text / upload your PDF" message.

For local dev, put the same keys (quoted) in `.dev.vars`.
