"use client";

import { OrdersQueue } from "@/components/orders/OrdersQueue";

/** The same order queue Operations works from, with links in `/admin`. */
export default function AdminOrdersPage() {
  return <OrdersQueue tree="admin" />;
}
