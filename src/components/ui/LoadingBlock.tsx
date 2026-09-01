import { cn } from "@/lib/utils";

/**
 * The wait before a screen exists: checking access, completing sign-in,
 * choosing a portal. Nothing about the destination is known yet, so this
 * states what is happening instead of promising a shape.
 *
 * For a screen that is already on the page and waiting on the API, use the
 * layout-matched shapes in `@/components/ui/loading` — never this.
 */

type Props = {
  label?: string;
  className?: string;
};

export function LoadingBlock({ label = "Loading…", className }: Props) {
  return (
    <div
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-3 p-6",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className="size-2 animate-pulse rounded-full bg-text-muted motion-reduce:animate-none"
        aria-hidden
      />
      <p className="text-body text-text-secondary m-0 text-center">{label}</p>
    </div>
  );
}
