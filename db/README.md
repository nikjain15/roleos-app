# RoleOS - database & auth

Live Supabase project `qaubhkrgcdllnqvtrccr` (Postgres + pgvector + Auth + RLS).
All migrations below are **applied**; the role corpus is seeded and grown.

## Migrations (run in order - all applied)

```
0001_init.sql             schema + extensions (vector, pgcrypto)
0002_rls.sql              Row-Level Security - the real security boundary
0003_auth_and_match.sql   new-user trigger + match_roles() RPC
0004_notifications.sql    notifications table + profiles.ambient (digests)
0005_google_tokens.sql    google_tokens (service-role-only) for Gmail/Calendar
0005_intents_watch.sql    intents/"keep me in the loop" demand capture
0006_ingested_roles.sql   roles.description + roles.source (ATS ingestion)
0007_admin_ingestion.sql  companies, ingestion_runs, roles_archive (admin)
0008_public_index_stats.sql  anon-safe aggregate stats for the marketing site
0009_index_ask_rate.sql   index Ask-RO rate limiting
0009_yc_source.sql        'yc' source columns (YC feeder)
```

Apply via the Supabase SQL editor or CLI:

```bash
supabase db push          # or paste each file into the SQL editor, in order
```

## Auth (no passwords - architecture.md §0 decision 4)

In the Supabase dashboard → Authentication → Providers:

1. **Google** - ✅ enabled. Gmail + Calendar readonly scopes wired (Flag C: real
   OAuth in v1) - the app requests them directly in `signInWithOAuth`, not via
   Supabase "additional scopes". ⚠️ The sensitive scopes mean the Google app
   stays in Testing/unverified until formal verification, so only the owner +
   added test users can grant Gmail/Calendar. Full setup: `docs/setup-google.md`.
2. **LinkedIn (OIDC)** - ✅ enabled (identity only - name/email/photo, not work history).
3. **Email (magic link)** - ✅ enabled; email/password disabled.

`profiles.role` defaults to `user`. Promote an admin out-of-band:

```sql
update public.profiles set role = 'admin' where id = '<auth-uid>';
```

## RLS invariants (audited - see `docs/security-audit.md`)

- Default deny; every table has RLS enabled.
- User-owned tables: `user_id = auth.uid()` (+ parallel admin read).
- `decision_events`: **insert-only** for users (append-only log).
- `profiles.role`: not user-modifiable (trigger `profiles_role_guard`).
- `roles` / `role_embeddings`: read-only to authenticated; writes = service role.
- `agent_runs`: admin read only.

## Env

See `.dev.vars.example`. `SUPABASE_SERVICE_ROLE_KEY` is server-only (seed +
admin + agent_runs writes); never shipped to the client.
