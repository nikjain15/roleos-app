# Profile Data Layer — extract · store · suggest (design spec)

> Status: **approved design, pre-build** (2026-07-25). The build contract for how
> RoleOS turns raw sources (LinkedIn · GitHub · résumé) into a structured,
> correctable profile, stores it, and — critically — **feeds what it learns back
> into what it suggests.** Build in the phases at the bottom; each is a thin slice
> through D1–D10 with its own PR.

## Why this exists

Two weaknesses in the current data layer:

1. **The profile is a text blob.** Each source (LinkedIn scrape, GitHub read, CV
   parse) is normalized to free text and concatenated into one `profileText`
   (`app/api/onboard/route.ts`). It works for embedding + matching, but nothing is
   typed, traceable, or correctable. RO can't say *"I know this because your
   LinkedIn says X,"* and the user can't fix a specific fact.
2. **The learning loop is open.** `decision_events` → `taste_model`
   (`lib/taste.ts projectTaste`) captures what the user cares about, but
   `matchProfile` only biases recall on the **goal/target** — it never reads
   `taste_model`. Taste is projected for display (`get_taste_model`) and never
   changes the ranking. **What RO learns does not yet change what RO suggests.**

Best-in-class fixes both: a **structured, provenanced, correctable profile**
feeding a **closed loop** where taste + outcomes adjust ranking — transparently.

## Principles (what makes it best-in-class)

1. **Structured + provenanced** — every fact is typed and traceable to a source
   (`"linkedin" | "github" | "resume" | "user"`) with a timestamp.
2. **Confidence-scored + correctable** — RO shows what it knows; the user fixes
   it; each fix is a high-weight `decision_event` (reuses the J1 correction path).
3. **Truth-gated** — no invented facts; every claim traces to a source (extends
   the existing résumé truth-gate).
4. **The loop closes** — taste and outcomes feed ranking as **labeled, stackable
   overlays**, never as silent filtering.

---

## Layer 1 — Extraction → a canonical Profile

All three sources normalize into one typed shape. **The JSON is deliberately
"table-shaped"**: every `experience` / `skill` / `project` is a discrete object
whose fields map 1:1 to a future SQL column, so promoting to relational tables
(Option B) is a mechanical explode, not a redesign (see "Decision 2" below).

```ts
// lib/profile-schema.ts (canonical — versioned)
type Source = "linkedin" | "github" | "resume" | "user";

interface ProfileFact<T> { value: T; source: Source; confidence: number; at: string }

interface CanonicalProfile {
  version: 1;
  identity: {
    name?: ProfileFact<string>;
    headline?: ProfileFact<string>;
    location?: ProfileFact<string>;
    links: { linkedin?: string; github?: string; site?: string };
  };
  experience: Array<{           // → future table `profile_experience`
    title: string; company: string; start?: string; end?: string;
    highlights: string[]; source: Source; confidence: number;
  }>;
  education: Array<{            // → future table `profile_education`
    school: string; degree?: string; field?: string; year?: string; source: Source;
  }>;
  skills: Array<{              // → future table `profile_skills`
    canonical: string;          // normalized to a taxonomy ("ml" → "Machine Learning")
    raw?: string; evidence?: string; source: Source; confidence: number;
  }>;
  projects: Array<{            // → future table `profile_projects` (GitHub shines)
    name: string; description?: string; tech: string[];
    stars?: number; url?: string; source: Source;
  }>;
  signals: {                   // derived positioning
    seniority?: string; domains: string[]; strengths: string[];
    target?: { role?: string; level?: string; comp?: string; location?: string; cares_about?: string[] };
  };
}
```

### How each source fills it

- **LinkedIn** (`lib/profile-fetcher.ts`) — already parses structured fields
  (`apimaestroProfileToText`: basic_info, experience[], education[], top_skills).
  Map those fields straight into the canonical shape (deterministic, high
  confidence) instead of flattening to text.
- **GitHub** (`lib/github-fetch.ts`) — structured API: user (name/bio/company/
  location), top repos → `projects[]`, languages → `skills[]`, README →
  `signals.strengths`. Deterministic, high confidence.
- **Résumé / CV** (`lib/parse-document.ts`) — raw text; needs an **LLM structurer**
  (Sonnet, strict schema, truth-gated) to emit canonical objects. Only this source
  needs a model pass.

### Merge & reconcile (one pass)

A `structureProfile` step (`lib/profile-structure.ts`): take the deterministic
LinkedIn/GitHub objects + the LLM-structured résumé, then **merge → canonicalize
→ reconcile**:
- dedupe skills to a canonical taxonomy (`lib/skill-taxonomy.ts`);
- resolve conflicts by recency/authority (LinkedIn "current company" > résumé);
- stamp `source` + `confidence` + `at` on every fact;
- surface conflicts to the user → each confirmation/correction is a
  `decision_event` (feeds taste).

Truth-gate: the résumé structurer's output must trace to the source text (reuse
the résumé truth-gate machinery). No invented experience/skills.

---

## Layer 2 — Storage

`master_profile.data` is already `jsonb` (migration `0001_init.sql`) — **no schema
change needed.** Store raw sources (re-processable) alongside the derived profile:

```jsonc
master_profile.data = {
  "sources": {                              // RAW, per-source, provenanced
    "linkedin": { "url": "...", "text": "...", "fetched_at": "..." },
    "github":   { "handle": "...", "text": "..." },
    "resume":   { "filename": "...", "text": "..." }
  },
  "profile": { /* CanonicalProfile (the derived projection) */ },
  "profile_version": 1
}
```

- **`sources`** = raw source-of-truth, kept so the profile is **re-derivable** on
  change (master upgrades = *propose-and-approve*, the learning-ledger pattern).
- **`profile`** = the canonical projection matching/display read from.
- `decision_events` (append-only) and `taste_model` (derived) — **unchanged**
  (`0001_init.sql`). `taste_model` already carries `attribute · value · confidence
  · evidence · user_confirmed`.

---

## Layer 3 — Usage: closing the loop

Shown fit becomes a **stack of labeled overlays**, each explaining itself:

```
base(profile × role)  →  + taste overlay  →  + outcome overlay  =  shown fit
      (embeddings +          (Decision 1:          (existing
       deep-reason)           transparent           outcome-learning)
                              reorder, labeled)
```

1. **Profile → sharper recall.** Structured skills/titles/seniority build better
   facet queries + embeddings than a raw blob (`lib/run-match.ts buildQueries`).
2. **Taste → re-rank overlay (Decision 1 = A, transparent).** After deep-reason
   fit scores, apply a taste adjustment: boost/demote by high-confidence
   `taste_model` attributes, **always labeled** (*"ranked up — you told me you
   want AI-native"*), **nothing hidden**. Sits beside the outcome overlay. Taste
   does **not** filter recall (rejected: hiding roles in a job hunt breaks trust;
   revisit only once taste accuracy is proven).
3. **Corrections → live.** Extends the J1 live re-rank; a fact correction updates
   the profile and re-ranks with a visible reason.

This is the moat closing: **what RO learns visibly changes what RO suggests.**

---

## Decision log (the two forks + their tradeoffs)

### Decision 1 — Taste feedback aggressiveness → **A: transparent re-rank overlay**
Taste changes the **order** of already-matched roles, always labeled and
reversible; it never changes **which** roles are pulled. Rejected B (taste also
biases recall) because silently not-showing a role in a job hunt is a
trust-breaking failure mode. Graduate to recall-bias only after taste accuracy is
demonstrated, and only with an always-visible "roles I weighted down + why."

### Decision 2 — Profile store shape → **A: canonical JSON, B-ready**

| | Option A — canonical JSON (chosen) | Option B — relational tables |
|---|---|---|
| **What** | One `CanonicalProfile` JSON in `master_profile.data.profile` | `profile_skills` / `profile_experience` / … tables |
| **Effort now** | ~0 migration (column is already `jsonb`) | +~1–1.5 days (tables + RLS + tests + exploded writes) |
| **Buys** | Matching + a correctable "what RO knows" view | Cross-user queries, joins to roles, structured filters, analytics |
| **Needed for the core loop?** | ✅ yes | ❌ no — embeddings + JSON fully cover one-user→roles |
| **Risk** | none material | building unused query power before a use exists |

**Chosen: A now, engineered for a near-free move to B.** The core loop (match one
user → roles) never needs relational; B only helps **reverse/aggregate** queries
("which users match this new role," skill analytics, structured UI filters) — none
on the near roadmap.

**Why deferring stays cheap (the tradeoff the whole design protects):** normally
deferring costs *more* (backfill/migration tax). Here it doesn't, because:
1. **Near-zero data to backfill** — J1 just shipped; the tax is ~0 now and grows
   slowly.
2. **The JSON is table-shaped** — each `experience`/`skill`/`project` already has
   exactly the fields its future row needs, so backfill is a mechanical explode.

**Migration path A → B (when a feature needs it), ~2–3 days:**
1. `CREATE TABLE profile_skills/experience/projects` (+ RLS, mirroring
   `master_profile`'s owner policy) — one migration.
2. **Backfill**: iterate `master_profile.data.profile`, insert one row per
   array element (pure explode — no reshaping, thanks to the table-shaped JSON).
3. **Dual-write**: the `structureProfile` writer writes JSON *and* rows for a
   window (both stay consistent).
4. **Reader cutover**: point the query that needs relational at the tables; leave
   matching/display on JSON until they benefit.
5. Verify RLS on the new tables (cross-user read blocked) + tests.

Keeping the raw `sources` means we can always re-derive rather than trust a
lossy backfill, so the migration carries no data-loss risk.

---

## Build phases (each its own slice + PR)

- **P1 — Canonical schema + structurer.** `lib/profile-schema.ts` +
  `lib/profile-structure.ts` (deterministic LinkedIn/GitHub mappers + LLM résumé
  structurer + merge/canonicalize + truth-gate). Unit-tested against fixtures.
  `/api/onboard` produces both the text (for embedding) and the canonical profile.
- **P2 — Storage + "what RO knows" view.** Persist `data.sources` + `data.profile`
  in `/api/save`. A correctable profile view; edits → `decision_events`.
- **P3 — Close the loop.** Taste re-rank overlay in `lib/run-match.ts` (labeled,
  transparent) reading `taste_model`; recall queries enriched from the structured
  profile. Show the overlay reasons in the UI.
- **P4 (later, only if needed) — Promote to relational (Option B)** per the
  migration path above.

Invariants held throughout: truth-gate on résumé-derived facts · `decision_events`
append-only · RLS on every user table · every model call metered · human-gated
outward (this is all inbound reads + local projection).
