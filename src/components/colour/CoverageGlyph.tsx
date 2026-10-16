import { cn } from "@/lib/utils";

/**
 * A sheet filled to its strong-colour coverage, drawn from the foot up.
 *
 * Monochrome on purpose: coverage is a quantity, not a status, and it has to
 * read in greyscale beside a label that says the same thing in words. A page
 * with no strong colour is an empty sheet with one hairline at its foot, so
 * zero never looks like a missing picture.
 */
export function CoverageGlyph({
  bps,
  size = "md",
  className,
}: {
  /** Basis points of the whole sheet, 0–10,000. */
  bps: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const share = Math.max(0, Math.min(10_000, bps)) / 10_000;
  const inner = { x: 2.5, y: 2.5, width: 19, height: 27 };
  // A sliver of real colour still shows: never thinner than one unit.
  const fill = share === 0 ? 0 : Math.max(1, inner.height * share);
  const [width, height] = size === "sm" ? [18, 24] : [24, 32];
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 32"
      aria-hidden
      className={cn("text-text-primary shrink-0", className)}
    >
      <rect
        x={0.75}
        y={0.75}
        width={22.5}
        height={30.5}
        rx={1.5}
        className="fill-surface"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      {fill > 0 ? (
        <rect
          x={inner.x}
          y={inner.y + inner.height - fill}
          width={inner.width}
          height={fill}
          rx={0.5}
          fill="currentColor"
          opacity={0.85}
        />
      ) : (
        <line
          x1={inner.x + 2}
          x2={inner.x + inner.width - 2}
          y1={inner.y + inner.height - 0.5}
          y2={inner.y + inner.height - 0.5}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.45}
        />
      )}
    </svg>
  );
}
