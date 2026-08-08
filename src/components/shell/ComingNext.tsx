import { EmptyState } from "@/components/ui/EmptyState";
import type { NavItem } from "@/lib/nav";

type Props = {
  item: NavItem;
};

/**
 * Placeholder for nav destinations not yet built.
 * Parallel page workers replace the route wholesale — keep this thin.
 */
export function ComingNext({ item }: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p
        className="text-caption m-0 inline-flex items-center rounded-pill px-3 py-1"
        style={{
          backgroundColor: "var(--color-surface-variant)",
          color: "var(--color-text-secondary)",
        }}
      >
        Coming next
      </p>
      <EmptyState
        title={item.title}
        body={
          item.placeholderBody ||
          "This screen is reserved in navigation. A later change will replace this placeholder with the live surface."
        }
      />
    </div>
  );
}
