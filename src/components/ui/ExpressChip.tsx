import { Zap } from "lucide-react";

import { EXPRESS_LABEL } from "@/lib/express";

/**
 * The one Express tag, on orders and listings alike.
 *
 * A tag, not a status: it says how the deadline was promised, so it keeps the
 * neutral outline of the other order tags (Single-Shop) instead of a status
 * colour, and carries its meaning in the bolt and the word. The bolt takes the
 * info colour so the tag is findable in a dense queue without borrowing the
 * yellow that belongs to the page's one action.
 */
export function ExpressChip() {
  return (
    <span className="gg-chip border-outline" role="status">
      <Zap size={13} strokeWidth={2} aria-hidden style={{ color: "var(--color-info)" }} />
      <span className="text-caption text-text-primary">{EXPRESS_LABEL}</span>
    </span>
  );
}
