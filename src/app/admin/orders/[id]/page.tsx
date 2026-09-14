"use client";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";

export default function AdminOrderWorkspacePage() {
  return <OrderWorkspace queueHref="/admin/overview" queueLabel="Back to overview" />;
}
