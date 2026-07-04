# Runbook — enable email delivery (H2 go-live checklist)

> The code is READY and flag-gated (lib/email.ts; digests already call it as a no-op).
> **Every step below is yours (hard-stop):** it enables an external service on the domain.
> Until you finish, `email.skipped {reason:"flag_off"}` lines in Workers Logs show demand.

## 1 · Enable Cloudflare Email on roleos.fyi
1. CF dashboard → roleos.fyi → **Email → Email Routing → Enable**.
2. Add the shown MX + SPF records (the dashboard offers one-click).
3. **Destination address**: verify your own inbox (for routing replies).
4. **Email Workers → sending**: verify the sender domain (DKIM record the dashboard gives you).

## 2 · Bind the send capability to the app worker
In `wrangler.jsonc`, uncomment the prepared block:
```jsonc
"send_email": [{ "name": "SEND_EMAIL", "allowed_destination_addresses": [] }]
```
(Leave `allowed_destination_addresses` empty = any recipient; RO only ever sends to the
signed-in user's own auth email — the code has no arbitrary `to` path.)

## 3 · Flip the flags
```
wrangler secret put EMAIL_FROM            # e.g. ro@roleos.fyi (the DKIM-verified sender)
wrangler secret put EMAIL_DELIVERY_ENABLED  # value: 1
```
(Local: add both to `.dev.vars` if you want dev sends — usually don't.)

## 4 · Deploy + verify
1. Merge/deploy as usual (`main` auto-deploys).
2. Trigger a digest: `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://ro.roleos.fyi/api/cron/digests`.
3. Workers Logs: expect `email.delivered {to_domain:…}` (or `email.skipped {reason:"no_binding"}`
   → step 2 didn't deploy; `flag_off` → step 3 missed).
4. Check the inbox: subject `RO · <digest title>`, plain text, from your EMAIL_FROM.

## Rollback
Set `EMAIL_DELIVERY_ENABLED` to `0` (or delete the secret) and redeploy — delivery reverts to
the logged no-op instantly; in-feed digests are unaffected (they were never coupled).
