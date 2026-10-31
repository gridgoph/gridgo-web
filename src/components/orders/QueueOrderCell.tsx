import { ShopModeChip } from "@/components/orders/ShopModeChip";
import { TestOrderChip } from "@/components/orders/TestOrders";
import type { Order } from "@/lib/api/types";
import { groupPositionLabel, shopModeLabel, shopModeOf } from "@/lib/baskets";
import { clientLabel } from "@/lib/client-name";
import { describeQuantity } from "@/lib/quantity";

/** The Order column of an Operations queue: title, shop mode, client, id, quantity. */
export function QueueOrderCell({
  order,
  shopCounts,
}: {
  order: Order;
  shopCounts: ReadonlyMap<string, number>;
}) {
  const position = groupPositionLabel(order, shopCounts);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p
          className="text-body text-text-primary m-0 min-w-0 truncate"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {order.title || "Untitled order"}
        </p>
        <ShopModeChip mode={shopModeOf(order, shopCounts)} />
        <TestOrderChip order={order} />
      </div>
      <p className="text-caption text-text-secondary m-0 mt-0.5 truncate">
        {clientLabel(order)}
      </p>
      <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
        {position ? `${position} · ` : ""}Order {order.id}
      </p>
      <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
        {describeQuantity(order.quantity, order.unit)}
        {order.material ? ` · ${order.material}` : ""}
      </p>
    </div>
  );
}

/** What the Order column's filter box matches. */
export function queueOrderFilterValue(
  order: Order,
  shopCounts: ReadonlyMap<string, number>,
): string {
  return `${order.title ?? ""} ${order.id} ${order.material ?? ""} ${shopModeLabel(shopModeOf(order, shopCounts))} ${order.groupLabel ?? ""} ${clientLabel(order)}`;
}
