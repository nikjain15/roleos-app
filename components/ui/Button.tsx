import { forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Button — the design-system button (docs/specs/design-system.md §6). Grape is
 * primary. Never hand-roll `bg-info` buttons; use this so every screen matches.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "spark";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-tx hover:bg-primary-hover active:bg-primary-active",
  secondary: "border border-bd2 bg-surf text-tx hover:bg-surf2",
  ghost: "text-primary hover:bg-primary-bg",
  danger: "bg-dng text-white hover:opacity-90",
  spark: "bg-spark text-spark-ink hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-8 px-3 text-small",
  md: "min-h-10 px-4 text-small",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors ease-ro",
        "focus-visible:outline-none focus-visible:shadow-ring",
        "disabled:cursor-not-allowed disabled:bg-surf2 disabled:text-tx3 disabled:hover:bg-surf2",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
