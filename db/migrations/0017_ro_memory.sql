-- ── ro_memory (RO cross-screen memory, M1 — the durable "notebook") ──────────
-- docs/specs/ro-memory.md. A small, bounded set of TYPED NOTES RO has learned
-- about the user — "notebook, not a recording": short facts (targets, prefs,
-- style asks), NOT a chat log. Notes are mostly DERIVED from decision_events
-- (lib/ro/memory.deriveNotes) and embedded so RO recalls only the top-k RELEVANT
-- ones per reply — the resolution of "lose nothing" (store everything) vs
-- "bounded cost" (retrieve only what fits).
--
-- Requirements this shape serves:
--  • never surface wrong/stale — newest-wins via `superseded_by`; recall skips
--    superseded notes; confidence hardens only on repetition (set by the writer).
--  • lose nothing — append-only history; superseding never deletes.
--  • user-editable + visible — owner RLS (the "What RO remembers" view).
--  • human-gated-outward — a note is DATA; it can never trigger a send.
create table if not exists public.ro_memory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- 'global' | 'role:<uuid>' | 'artifact:<uuid>' — keeps résumé-tuning context out
  -- of unrelated screens (scoping prevents cross-screen bleed).
  scope           text not null default 'global',
  kind            text not null,                 -- identity | target | style | preference | correction
  text            text not null,                 -- the note itself (short)
  confidence      numeric not null default 0.6,  -- 0..1; hardens with repeated behavior
  source_event_id uuid,                           -- the decision_events row it derived from (nullable)
  embedding       vector(768),                    -- for top-k recall (server-set; nullable until embedded)
  created_at      timestamptz not null default now(),
  -- newest-wins: a corrected/updated note points the OLD row here; recall skips
  -- any row that has been superseded, so stale context is never surfaced.
  superseded_by   uuid references public.ro_memory (id) on delete set null
);

create index if not exists ro_memory_user_idx on public.ro_memory (user_id);
create index if not exists ro_memory_live_idx on public.ro_memory (user_id) where superseded_by is null;

-- Owner RLS: the notebook is the user's own — they read, add (explicit prefs),
-- edit/supersede, and delete it. Derived notes are inserted by the server with
-- the same user_id (the service role bypasses RLS). Mirrors role_notes.
alter table public.ro_memory enable row level security;

create policy ro_memory_owner_sel on public.ro_memory
  for select using (user_id = auth.uid());
create policy ro_memory_owner_ins on public.ro_memory
  for insert with check (user_id = auth.uid());
create policy ro_memory_owner_upd on public.ro_memory
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ro_memory_owner_del on public.ro_memory
  for delete using (user_id = auth.uid());

-- Top-k relevant notes for the CALLER (RLS-safe: auth.uid() + invoker rights, so a
-- user only ever recalls their own notebook). Skips superseded + unembedded rows
-- so stale context is never surfaced. Cosine distance (<=>), same op as match_roles.
create or replace function public.match_ro_memory(
  query_embedding vector(768),
  match_count int default 6
)
returns table (id uuid, text text, kind text, scope text, confidence numeric, distance float)
language sql stable as $$
  select m.id, m.text, m.kind, m.scope, m.confidence, m.embedding <=> query_embedding as distance
  from public.ro_memory m
  where m.user_id = auth.uid()
    and m.superseded_by is null
    and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;
