import { StatusChip } from "@/components/ui/StatusChip";
import { EXPRESS_LABEL } from "@/lib/express";

/**
 * The one Express tag, on orders and listings alike. Info tone and a bolt:
 * it says how the deadline was promised, not that anything is wrong, and it
 * never borrows the yellow that belongs to the page's one action.
 */
export function ExpressChip() {
  return <StatusChip tone="info" icon="zap" label={EXPRESS_LABEL} />;
}
