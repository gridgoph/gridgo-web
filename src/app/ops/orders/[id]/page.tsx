"use client";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";

export default function OpsOrderWorkspacePage() {
  return <OrderWorkspace queueHref="/ops/orders" payoutsHref="/ops/payouts" />;
}
