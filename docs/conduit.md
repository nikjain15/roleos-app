# Conduit integration

RoleOS routes its model calls through [Conduit](https://github.com/nikjain15/conduit),
a thin, dependency-light SDK that gives an app one unified interface over its
inference, retrieval and MCP surfaces. The Conduit client and MCP packages are
vendored into `lib/conduit/` (a plain copy, see `lib/conduit/VENDOR.md`).

## Why

Conduit's `@conduit/client` presents the SAME method surface whether the core
runs in-process (`mode: "embedded"`) or behind an HTTP gateway
(`mode: "gateway"`). Switching modes changes the transport, never the methods.
That lets RoleOS keep its metered, quality-gated model path exactly as it is
today while gaining a stable seam it can later point at a hosted gateway with no
call-site changes.

## The embedded seam (`agent/conduit.ts`)

RoleOS uses `mode: "embedded"`: it injects its own core into the client rather
than calling a network service.

- `resolve` wraps `agent/registry.ts:callModel`, RoleOS's single Anthropic entry
  point. Cost, tokens and latency are preserved on the returned run record, so
  cost accounting is unchanged.
- `retrieve` wraps `lib/match.ts:recallRolesMulti`, exposing role recall over the
  global/public corpus as Conduit's unified `retrieve`.

The primary answer path is switched: `agent/skills/run.ts:runSkill` (the one path
every user-facing skill answer takes) now generates through
`inferViaConduit` → `createClient({ mode: "embedded" })` → `client.infer` →
the injected `callModel`. The secondary shape-repair reformat stays a direct
`callModel`, and the quality gate is untouched.

```
app route → runSkill → inferViaConduit → @conduit/client.infer (embedded)
          → RoleOS core.resolve → callModel → Anthropic
```

## Dynamic difficulty routing over the seam

The embedded client carries a `pinModel` hop that RoleOS uses for dynamic,
difficulty-based routing (`agent/routing.ts`). A deterministic classifier reads
the prompt and seeds a starting tier on a cheapest→strongest ladder
(`quick_tag` Haiku → `draft` Sonnet → `reason` Opus); the answer routes **down**
for a trivially simple input and **up** when the quality gate returns
`needs_your_eyes` or grades the pass `weak` confidence. Each re-route is
expressed as a Conduit `pinModel`, so it stays a metered hop on the same unified
seam and is resolved back to a registry job before `callModel` runs. Escalation
is bounded (it can never loop) and the sampling contract below is unchanged.
See `ARCHITECTURE.md` §7 for the full ladder.

## Live-usage reporting to the Conduit gateway

Embedded mode keeps the answer path local, but RoleOS can still give a tenant
live usage/cost visibility. `lib/conduit/reporter.ts` is a crash-safe,
fire-and-forget **tap** on the metered record: when `CONDUIT_GATEWAY_URL` and
`CONDUIT_GATEWAY_TOKEN` are set, it POSTs each decision (use case, model,
provider, cost, latency, tokens) to the gateway's `POST /v1/decisions`.

- **NO-OP when unconfigured:** with either env var absent, no request is made
  and behaviour is byte-identical to before, so every existing test is
  unaffected.
- **Never blocks the answer:** the returned promise is pre-caught (callers
  `void` it), the fetch has a short timeout, and any error is swallowed. Nothing
  here can throw into the answer path.
- **Only mirrors, never mutates:** it reads the record that already ran; the
  model path, the metered-record math, and the sampling contract are untouched.
- **Placement preserves the invariant:** it lives under `lib/`, not `agent/`,
  because the agent layer is barred from importing outbound transport
  (`.dependency-cruiser` `agent-no-outbound-transport`). `agent/conduit.ts`
  imports only this pure function, so the human-gated-outward invariant holds.

## Sampling contract

RoleOS's registry never sends `temperature`/`top_p`/`top_k`: its reasoning and
drafting tiers (Opus 4.8, Sonnet 4.6) reject them, and the Haiku 4.5 tag tier is
a plain call. Conduit is transport-only and adds no sampling parameters, so the
contract is unchanged by this integration.

## Tests

- `tests/unit/conduit-client.test.ts`: the app answer path flows through the
  embedded client (provider mocked) and returns an answer; `retrieve` routes
  role recall through the client.
- `tests/unit/conduit-mcp.test.ts`: the MCP registry lists the tool and a
  `tools/call` returns a valid result; bad arguments and unknown tools become
  error results, never throws.

See `docs/MCP.md` for the MCP server and its hosted URL shape.
