/**
 * The shop's status pill on the rail and on My shop (gridgoph/gridgo-web#327):
 * open or closed now, and whether the shop takes Express. Words only; the dot
 * beside them is never the only signal.
 */
import type { ExpressSettings, ShopHours } from "@/lib/api/types";

export type ShopStatus = {
  open: boolean | null;
  express: boolean | null;
  line: string;
};

/** Dispatched after the Owner changes something the pill shows, so it re-reads. */
export const SHOP_STATUS_CHANGED = "gridgo:shop-status-changed";

export function shopStatus(
  hours: Pick<ShopHours, "isOpenNow" | "temporarilyClosed"> | null,
  express: Pick<ExpressSettings, "expressEnabled"> | null,
): ShopStatus {
  const open = hours ? hours.isOpenNow && !hours.temporarilyClosed : null;
  const on = express ? express.expressEnabled : null;
  const parts = [
    open == null ? null : open ? "Open" : hours?.temporarilyClosed ? "Closed for now" : "Closed",
    on == null ? null : on ? "Express on" : "Express off",
  ].filter(Boolean);
  return { open, express: on, line: parts.join(" · ") };
}
