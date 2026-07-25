import { forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Input — text field (docs/specs/design-system.md §6). Grape focus ring. Pass
 * `invalid` to show the danger border for validation errors.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-md border bg-surf px-3 py-2 text-body text-tx placeholder:text-tx3",
        "transition-shadow ease-ro focus:outline-none focus:shadow-ring",
        invalid ? "border-dng focus:border-dng" : "border-bd2 focus:border-primary",
        className,
      )}
      {...props}
    />
  );
});
