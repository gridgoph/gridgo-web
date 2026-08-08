import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  label?: string;
  className?: string;
};

export function LoadingBlock({ label = "Loading…", className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border border-outline bg-surface p-4",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <p className="text-body text-text-secondary m-0">{label}</p>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
