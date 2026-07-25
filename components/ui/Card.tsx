import { cn } from "@/lib/cn";

/**
 * Card — surface container (docs/specs/design-system.md §6). Radius xl on --surf.
 * `elevation`: flat (hairline border) · raised (shadow-md) · floating (shadow-lg).
 */
type Elevation = "flat" | "raised" | "floating";

const ELEVATION: Record<Elevation, string> = {
  flat: "border border-bd",
  raised: "border border-bd shadow-md",
  floating: "shadow-lg",
};

export function Card({
  elevation = "flat",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { elevation?: Elevation }) {
  return (
    <div className={cn("rounded-xl bg-surf p-5", ELEVATION[elevation], className)} {...props}>
      {children}
    </div>
  );
}
