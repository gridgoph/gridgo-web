import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
  /** When true, stretch to container width. */
  fullWidth?: boolean;
};

/**
 * Primary = yellow (one per screen/panel). Secondary = monochrome outline.
 * Never put repeated yellow primary buttons in a dense queue.
 */
export function Button({
  variant = "secondary",
  children,
  fullWidth,
  className = "",
  disabled,
  type = "button",
  ...rest
}: Props) {
  const base =
    variant === "primary"
      ? "gg-btn gg-btn-primary"
      : variant === "danger"
        ? "gg-btn gg-btn-secondary text-error border-error"
        : "gg-btn gg-btn-secondary";

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${fullWidth ? "w-full" : ""} disabled:opacity-[0.38] disabled:cursor-not-allowed hover:bg-overlay-hover active:bg-overlay-pressed ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
