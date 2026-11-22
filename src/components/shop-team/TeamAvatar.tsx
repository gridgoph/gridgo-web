import { cn } from "@/lib/utils";

/** "Ana Cruz" → "AC"; one name gives one letter. */
export function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const SIZE = {
  sm: "size-9 text-caption",
  md: "size-14 text-h3",
  lg: "size-24 text-h1",
} as const;

/**
 * A teammate's face: initials on the neutral surface, or inverted when it is
 * the one picked. A dot marks someone on shift; the words beside the avatar
 * always say it too, so the dot is never the only signal.
 */
export function TeamAvatar({
  name,
  size = "sm",
  selected = false,
  onShift = false,
  className,
}: {
  name: string;
  size?: keyof typeof SIZE;
  selected?: boolean;
  onShift?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-pill border",
          SIZE[size],
          selected
            ? "border-text-primary bg-text-primary text-surface"
            : "border-outline bg-surface-variant text-text-primary",
        )}
        style={{ fontFamily: "var(--font-bold)" }}
      >
        {initialsOf(name)}
      </span>
      {onShift ? (
        <span
          className={cn(
            "absolute rounded-pill border-2 border-surface bg-success",
            size === "sm" ? "-right-0.5 -top-0.5 size-3" : "right-0 top-0 size-4",
          )}
        />
      ) : null}
    </span>
  );
}
