import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading shapes for screens that are waiting on the API.
 *
 * A skeleton here is a low-fidelity preview of the layout that is arriving, not
 * a spinner in a different costume. Two rules follow from that, and together
 * they are the whole contract:
 *
 * 1. Anything already known at render time renders for real, immediately —
 *    page copy, section headings, stat labels, table column names, the Refresh
 *    control. Reserve space only for values still in flight.
 * 2. A reserved value occupies the box its real value will occupy, so nothing
 *    jumps when the data lands.
 *
 * That is why a page never early-returns a loading screen. It renders its own
 * frame and swaps one region. `LoadingBlock` remains for the three gate states
 * where the page itself is still unknown — the sign-in callback, the workspace
 * redirect, and the portal access check.
 *
 * Dense queues do not need anything from this file: `DataTable` already takes
 * `loading` and holds its own layout, column headers included.
 */

/**
 * Fixed width cycle. Random widths would differ between the server render and
 * the client hydration, which React reports as a mismatch.
 */
const LINE_WIDTHS = ["82%", "64%", "73%", "56%", "88%", "61%"];

function lineWidth(index: number): string {
  return LINE_WIDTHS[index % LINE_WIDTHS.length];
}

/**
 * One announcement per waiting region. The bars themselves are `aria-hidden`,
 * so assistive tech hears "Loading payouts" once instead of counting rectangles.
 */
function Reserving({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Paragraph-shaped placeholder for a body of text of unknown length. */
export function SkeletonLines({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: lineWidth(i) }} />
      ))}
    </div>
  );
}

/**
 * The recurring queue card: a title with a caption under it, a status chip on
 * the trailing edge, and a body. Used by the screens that render results as a
 * list of `gg-card` rows rather than a table — payouts, escalations, claims,
 * recovery, dispatch, matching.
 */
export function SkeletonCards({
  count = 3,
  lines = 2,
  chip = true,
  label,
  className,
}: {
  count?: number;
  /** Body rows below the title block. */
  lines?: number;
  /** Whether the real card carries a status chip on the trailing edge. */
  chip?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <Reserving label={label}>
      <ul
        className={cn("m-0 flex list-none flex-col gap-3 p-0", className)}
        aria-hidden
      >
        {Array.from({ length: count }).map((_, i) => (
          <li key={i} className="gg-card flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-5" style={{ width: lineWidth(i) }} />
                <Skeleton className="h-3 w-40" />
              </div>
              {chip ? (
                <Skeleton className="h-7 w-28 shrink-0 rounded-pill" />
              ) : null}
            </div>
            {lines > 0 ? <SkeletonLines lines={lines} /> : null}
          </li>
        ))}
      </ul>
    </Reserving>
  );
}

/**
 * Detail workspace: the header card that names the record, then the packed
 * two-column body. Mirrors the `lg:grid-cols-2` workspaces under QA, payments
 * and supplier jobs.
 */
export function SkeletonDetail({
  label,
  panels = 4,
}: {
  label: string;
  /** Card panels below the header, distributed across the two columns. */
  panels?: number;
}) {
  return (
    <Reserving label={label} className="flex w-full flex-col gap-3">
      <div className="flex w-full flex-col gap-3" aria-hidden>
        <header className="gg-card flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-7 w-28 shrink-0 rounded-pill" />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-outline-subtle pt-3">
            <Skeleton className="h-11 w-36 rounded-field" />
            <Skeleton className="h-11 w-28 rounded-field" />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: panels }).map((_, i) => (
            <section key={i} className="gg-card flex flex-col gap-3">
              <Skeleton className="h-5 w-40" />
              <SkeletonLines lines={3} />
            </section>
          ))}
        </div>
      </div>
    </Reserving>
  );
}

/**
 * A single value still in flight, sized to the text it replaces. Use inside a
 * card whose labels and structure are already real.
 */
export function SkeletonValue({ className }: { className?: string }) {
  return <Skeleton className={cn("h-7 w-16", className)} aria-hidden />;
}
