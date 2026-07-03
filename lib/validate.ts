import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * Standard request-body validation for API routes (D6: every new route validates
 * input with zod). Parses `req.json()` against a schema and returns a typed result
 * that a route can branch on without try/catch boilerplate:
 *
 *   const parsed = await validateBody(req, GoalSchema);
 *   if (!parsed.ok) return parsed.response; // 400 with field errors
 *   const goal = parsed.data;               // fully typed + validated
 *
 * Fails closed: malformed JSON, wrong shape, or extra-strict mismatches all yield a
 * 400 with a compact `{ error, issues }` body — never a 500, never an unchecked cast.
 */
export type ValidateResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function validateBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<ValidateResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: badRequest("invalid JSON body") };
  }
  return validateValue(schema, raw);
}

/**
 * Validate already-parsed data (e.g. query params assembled into an object, or a
 * nested payload). Same fail-closed contract as `validateBody`.
 */
export function validateValue<T>(schema: ZodType<T>, value: unknown): ValidateResult<T> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  return { ok: false, response: badRequest("validation failed", issues) };
}

function badRequest(error: string, issues?: Array<{ path: string; message: string }>): NextResponse {
  return NextResponse.json(issues ? { error, issues } : { error }, { status: 400 });
}
