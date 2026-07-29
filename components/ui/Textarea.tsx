import { forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Textarea — multi-line text field (docs/specs/design-system.md §6). Mirrors
 * Input: grape focus ring, `invalid` for the danger border.
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-md border bg-surf px-3 py-2 text-body leading-relaxed text-tx placeholder:text-tx3",
        "transition-shadow ease-ro focus:outline-none focus:shadow-ring",
        invalid ? "border-dng focus:border-dng" : "border-bd2 focus:border-primary",
        className,
      )}
      {...props}
    />
  );
});
