import { StatusChip } from "@/components/ui/StatusChip";
import { shopModeLabel, type ShopMode } from "@/lib/baskets";

/**
 * "Single-Shop" or "Multi-Shop, N shops". Neutral on purpose: it says what
 * kind of order this is, not whether anything is wrong with it, and a queue
 * of them must not become a column of colour.
 */
export function ShopModeChip({ mode }: { mode: ShopMode }) {
  return (
    <StatusChip
      tone="neutral"
      icon={mode.kind === "single" ? "store" : "split"}
      label={shopModeLabel(mode)}
    />
  );
}
