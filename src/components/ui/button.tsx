import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * GRIDGO button variants.
 *
 * Yellow budget: only `primary` (and the legacy alias for the one CTA) may use
 * action-yellow. A bare <Button> is the neutral outline control — never yellow.
 *
 * shadcn stock names kept for registry code:
 * - outline  → default / secondary (neutral)
 * - default  → monochrome filled structural (rare)
 * - primary  → action-yellow CTA (one per screen/panel)
 * - destructive → danger / error path
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-2",
    "rounded-[var(--radius-field)] border border-transparent bg-clip-padding",
    "text-button whitespace-nowrap select-none",
    "transition-[background-color,border-color,opacity,color] duration-200 ease-out",
    "outline-none",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-[0.38]",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Neutral outlined control — DEFAULT. Not yellow. */
        outline:
          "border-border bg-card text-foreground hover:bg-overlay-hover active:bg-overlay-pressed aria-expanded:bg-muted",
        /** Alias of outline for GRIDGO secondary. */
        secondary:
          "border-border bg-card text-foreground hover:bg-overlay-hover active:bg-overlay-pressed aria-expanded:bg-muted",
        /**
         * Yellow CTA — finite budget. One per screen/panel.
         * Do not use in dense queues as a repeated row action.
         */
        primary:
          "bg-[var(--color-action-yellow)] text-[var(--color-action-yellow-on)] hover:opacity-90 border-transparent",
        /** Monochrome filled structural control (shadcn `default`). Not yellow. */
        default:
          "bg-primary text-primary-foreground hover:opacity-90",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "border-destructive/40 bg-card text-destructive hover:bg-destructive/10",
        /** Alias of destructive for existing GRIDGO call sites. */
        danger:
          "border-destructive/40 bg-card text-destructive hover:bg-destructive/10",
        link: "text-[var(--color-brand)] underline-offset-4 hover:underline h-auto min-h-0 px-0",
      },
      size: {
        default: "min-h-11 min-w-11 h-11 px-4",
        sm: "min-h-11 h-11 gap-1.5 px-3 text-caption",
        lg: "min-h-11 h-12 gap-2 px-5",
        icon: "size-11 min-h-11 min-w-11 p-0",
        "icon-xs": "size-11 min-h-11 min-w-11 p-0",
        "icon-sm": "size-11 min-h-11 min-w-11 p-0",
        "icon-lg": "size-11 min-h-11 min-w-11 p-0",
        xs: "min-h-11 h-11 gap-1 px-2.5 text-caption",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      /** GRIDGO: bare Button is neutral outline, never yellow. */
      variant: "outline",
      size: "default",
      fullWidth: false,
    },
  },
);

function Button({
  className,
  variant = "outline",
  size = "default",
  fullWidth = false,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    fullWidth?: boolean;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, fullWidth, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
