/**
 * Tiny classname joiner — no dependency. Filters falsy values so callers can do
 * `cn("base", cond && "extra", props.className)`. Not a tailwind-merge; keep
 * variant maps non-overlapping so the last class doesn't fight an earlier one.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
