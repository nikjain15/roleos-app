import { cn } from "@/lib/cn";

/**
 * Badge — status pill (docs/specs/design-system.md §6). Tone maps to a semantic
 * state (bg + text + border, per face). `dot` adds the state dot. State is never
 * color-only — always pass a readable label.
 */
type Tone = "neutral" | "info" | "suc" | "warn" | "dng" | "primary";

const TONES: Record<Tone, string> = {
  neutral: "bg-surf2 text-tx2 border-bd",
  info: "bg-info-bg text-info-tx border-info-bd",
  suc: "bg-suc-bg text-suc-tx border-suc-bd",
  warn: "bg-warn-bg text-warn-tx border-warn-bd",
  dng: "bg-dng-bg text-dng-tx border-dng-bd",
  primary: "bg-primary-bg text-primary border-primary-bd",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-tx3",
  info: "bg-info",
  suc: "bg-suc",
  warn: "bg-warn",
  dng: "bg-dng",
  primary: "bg-primary",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-small font-medium",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}
