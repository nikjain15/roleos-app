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
