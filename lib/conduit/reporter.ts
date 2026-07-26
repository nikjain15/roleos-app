import { env } from "@/lib/env";

/**
 * Live-usage reporter for the Conduit gateway (docs/conduit.md §5).
 *
 * RoleOS runs Conduit in EMBEDDED mode (agent/conduit.ts): the answer path is
 * local, and every metered call produces a RoleOS `AgentRunRecord`. This module
 * is a crash-safe, fire-and-forget TAP on that record: when the gateway env vars
 * are set, it POSTs each decision to the Conduit gateway's `/v1/decisions` so a
 * tenant gets live usage/cost visibility. It NEVER touches the model path, the
 * metered-record math, or the sampling contract — it only mirrors what already
 * ran.
 *
 * Guarantees:
 *  - NO-OP when `CONDUIT_GATEWAY_URL` / `CONDUIT_GATEWAY_TOKEN` are absent, so
 *    current behaviour and every existing test are byte-identical.
 *  - Never blocks or fails the user answer: the returned promise is pre-caught
 *    (callers `void` it), the fetch has a short timeout, and any error is
 *    swallowed. Nothing here can throw upward into the answer path.
 *
 * NOTE ON PLACEMENT: this lives under `lib/` (not `agent/`) on purpose. The
 * agent layer is barred from importing outbound transport (.dependency-cruiser
 * `agent-no-outbound-transport`); the caller in `agent/conduit.ts` only imports
 * this pure function, keeping the human-gated-outward invariant intact.
 */

/** The metered decision to mirror to the gateway. Matches `POST /v1/decisions`.
 *  Tenant is derived server-side from the bearer token, so it is NOT sent. */
export interface DecisionReport {
  useCase: string;
  model: string;
  provider: string;
  costUsd: number;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  gateStatus?: string;
}

/** Short cap so a slow/hung gateway can never stall the user answer. */
const TIMEOUT_MS = 1500;

interface GatewayEnv {
  CONDUIT_GATEWAY_URL?: string;
  CONDUIT_GATEWAY_TOKEN?: string;
}

function gatewayConfig(): { url: string; token: string } | null {
  let url: string | undefined;
  let token: string | undefined;
  try {
    const e = env() as unknown as GatewayEnv;
    url = e.CONDUIT_GATEWAY_URL;
    token = e.CONDUIT_GATEWAY_TOKEN;
  } catch {
    return null;
  }
  if (!url || !token) return null; // NO-OP: gateway not configured.
  return { url: url.replace(/\/+$/, ""), token };
}

/**
 * Fire-and-forget: mirror one metered decision to the Conduit gateway.
 *
 * Returns a promise that NEVER rejects (errors are swallowed) so callers can
 * simply `void reportDecision(...)`. Tests may `await` it to observe the fetch.
 * When the gateway env vars are unset this is a no-op and no request is made.
 */
export function reportDecision(report: DecisionReport): Promise<void> {
  return send(report).catch(() => {
    /* swallow: observability must never break the answer path */
  });
}

async function send(report: DecisionReport): Promise<void> {
  const cfg = gatewayConfig();
  if (!cfg) return;

  await fetch(`${cfg.url}/v1/decisions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ ...report, at: new Date().toISOString() }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}
