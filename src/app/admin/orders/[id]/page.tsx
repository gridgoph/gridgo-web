"use client";

import { RemoveOrder } from "@/app/admin/orders/[id]/_components/RemoveOrder";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";

const QUEUE_HREF = "/admin/overview";

export default function AdminOrderWorkspacePage() {
  return (
    <OrderWorkspace
      queueHref={QUEUE_HREF}
      queueLabel="Back to overview"
      dangerAction={(order) => <RemoveOrder order={order} returnHref={QUEUE_HREF} />}
    />
  );
}
