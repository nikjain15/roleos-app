-- ── Fit-on-browse (roles-workspace P0-7, slice W1) ───────────────────────────
-- A signed-in user browsing /explore sees a per-role fit indicator. Roles the
-- matcher already reasoned about show the real fit; every other role gets a
-- cheap embedding-similarity ESTIMATE (no model call). Similarity is only
-- meaningful RELATIVE TO THE USER's own distance distribution (a senior AI PM
-- sits ~0.29 median cosine distance from this corpus, a non-tech profile ~0.41),
-- so we cache per-user percentile anchors next to the cached profile embedding.

-- Cached profile embedding + that user's corpus-distance percentile anchors.
-- Written ONLY by the server (service role) — no user insert/update policies on
-- purpose: the embedding must always be derived from master_profile by our code,
-- never client-supplied. Users may read their own row.
create table if not exists public.profile_embeddings (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  embedding    vector(768) not null,
  model        text not null,
  profile_hash text not null,               -- sha-256 of the profile text it was derived from
  d10          float,                       -- user's 10th-percentile corpus distance ("strong signal" anchor)
  d35          float,                       -- user's 35th-percentile corpus distance ("worth a look" anchor)
  updated_at   timestamptz not null default now()
);

-- RLS: default deny; owner may read; all writes via service role only.
alter table public.profile_embeddings enable row level security;

create policy profile_embeddings_owner_sel on public.profile_embeddings
  for select using (user_id = auth.uid());

-- Exact distances for a SPECIFIC set of roles (pk join — no ANN, so it is not
-- subject to the HNSW ef_search cap that limits match_roles to ~40 rows).
-- Invoker-rights + role_embeddings RLS means anon/authenticated callers get no
-- rows; the server calls this with the service role (same precedent as match_roles).
create or replace function public.role_distances(
  query_embedding vector(768),
  role_ids uuid[]
)
returns table (role_id uuid, distance float)
language sql stable as $$
  select e.role_id, e.embedding <=> query_embedding as distance
  from public.role_embeddings e
  where e.role_id = any(role_ids);
$$;

-- One-off per profile change: the user's distance distribution over the whole
-- embedded corpus (~1.5k rows today — a bounded scan, run only when the cached
-- embedding is refreshed, never per page view).
create or replace function public.profile_distance_quantiles(
  query_embedding vector(768)
)
returns table (d10 float, d35 float)
language sql stable as $$
  select
    percentile_cont(0.10) within group (order by d)::float as d10,
    percentile_cont(0.35) within group (order by d)::float as d35
  from (
    select e.embedding <=> query_embedding as d
    from public.role_embeddings e
  ) s;
$$;
