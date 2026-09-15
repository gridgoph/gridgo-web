"use client";

import { RiderLiveView } from "@/components/riders/RiderLiveView";

/** Super Admin: the same live rider map, with orders opening in the admin tree. */
export default function AdminRiderMapPage() {
  return <RiderLiveView orderHref={(orderId) => `/admin/orders/${orderId}`} />;
}
