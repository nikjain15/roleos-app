# RoleOS — database & auth

New Supabase project (architecture.md §0 decision 2). Postgres + pgvector + Auth + RLS.

## Migrations (run in order)

```
0001_init.sql            schema + extensions (vector, pgcrypto)
0002_rls.sql             Row-Level Security — the real security boundary
0003_auth_and_match.sql  new-user trigger + match_roles() RPC
```

Apply via the Supabase SQL editor or CLI:

```bash
supabase db push          # or paste each file into the SQL editor, in order
```

## Auth (no passwords — architecture.md §0 decision 4)

In the Supabase dashboard → Authentication → Providers:

1. **Google** — enable; set the OAuth client id/secret. For **Gmail + Calendar**
   (Flag C: real OAuth in v1), add the scopes
   `https://www.googleapis.com/auth/gmail.readonly` and
   `https://www.googleapis.com/auth/calendar.readonly`. ⚠️ These are sensitive
   scopes → Google app verification is required before non-test users can grant
   them. Start verification early; until then, the developer + added test users
   work. (See memory: roleos-build-decisions, Flag C.)
2. **Email (magic link)** — enable; disable email/password.

`profiles.role` defaults to `user`. Promote an admin out-of-band:

```sql
update public.profiles set role = 'admin' where id = '<auth-uid>';
```

## RLS invariants (verified by tests in Phase 5)

- Default deny; every table has RLS enabled.
- User-owned tables: `user_id = auth.uid()` (+ parallel admin read).
- `decision_events`: **insert-only** for users (append-only log).
- `profiles.role`: not user-modifiable (trigger `profiles_role_guard`).
- `roles` / `role_embeddings`: read-only to authenticated; writes = service role.
- `agent_runs`: admin read only.

## Env

See `.dev.vars.example`. `SUPABASE_SERVICE_ROLE_KEY` is server-only (seed +
admin + agent_runs writes); never shipped to the client.
