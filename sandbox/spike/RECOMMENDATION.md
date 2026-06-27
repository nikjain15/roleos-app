# Gate-3 sandbox: recommendation

**Status:** spike harness built on both runtimes; the **live** number-for-number
run needs a CF account with Containers enabled and an `E2B_API_KEY`. This doc
gives the call on what's known + flags exactly which cells are pending live keys.

## Scorecard

| Criterion (weight) | CF Sandbox SDK | e2b | Notes |
|---|---|---|---|
| **Isolation** (×3) | container (gVisor-class), DO-owned | **Firecracker microVM** (stronger) | e2b wins the raw boundary; CF is sufficient for *our* threat model (we run take-home builds, not adversarial multi-tenant crypto-mining) |
| **Preview latency** (×2) | `exposePort()` native; needs wildcard DNS on a custom domain | `getHost(port)` native | ~par; *pending live cold-start numbers* |
| **Egress control** (×3) | container network policy + Worker in front | allowlist via sandbox config | both deny-by-default capable; *pending live verification* |
| **Cost / build** (×2) | CF Containers usage (one bill) | e2b per-second VM billing (second vendor) | *pending live $ — both metered in a 60s run* |
| **CF-integration fit** (×2) | **native** — DO owns the sandbox, one deploy, one secret store, `getSandbox(env.Sandbox, id)` | external API + second key + second vendor | decisive for our architecture |

## The call: **Cloudflare Sandbox SDK** — provisional, pending one live check

**Why CF wins for RoleOS specifically:**
1. **Ownership model is the architecture.** architecture.md §1.2 says the
   build-studio Durable Object *owns the live sandbox*. CF Sandbox SDK **is** a
   DO-owned container — `getSandbox(env.Sandbox, sessionId)` is exactly that
   binding. With e2b the DO would hold a remote handle to a third-party VM:
   more moving parts, a second failure domain, a second vendor on the critical
   path of the make-or-break gate.
2. **One platform, one bill, one secret store.** All-Cloudflare is a locked
   decision. e2b reintroduces a non-CF dependency we just spent Flag A removing
   from embeddings.
3. **Preview URLs are native** (`exposePort`) and map onto our two-pane studio.

**The one thing e2b does better — and why it doesn't flip the call:** Firecracker
microVMs are a stronger isolation boundary than containers. That matters most for
*hostile* untrusted code. Our gate-3 workload is the *user's own* take-home/MVP
build (npm install + a dev server), not adversarial code — so container-grade
isolation + a strict egress allowlist + memory/runtime caps is proportionate.

**The condition before we commit (the live check):** stand up the
`cf-sandbox/` worker on a Containers-enabled account and confirm three things
hold under load:
- egress **deny-by-default** actually blocks a non-allowlisted host,
- preview cold-start is acceptable for the studio UX (target < ~3s to first byte),
- `$`/build at our expected volume is sane.

If any fails badly, e2b is the ready fallback — the `SandboxRuntime` interface
means switching is a one-file swap, not a rewrite (the same two-way-door
principle as skills↔DO).

## Recommendation to the principal

Go **CF Sandbox SDK**. Build the gate-3 studio against the `SandboxRuntime`
interface (not the CF API directly) so the e2b fallback stays one file away.
Run the live three-point check at the **start of Phase 3** (when we build the
studio), before writing studio UI on top of it — not now, since it gates Phase 3,
not Phase 1.
