"use client";

import { RiderLiveView } from "@/components/riders/RiderLiveView";

/** Operations: riders on live trips, with vehicle pins and road routes. */
export default function OpsRiderMapPage() {
  return <RiderLiveView orderHref={(orderId) => `/ops/orders/${orderId}`} />;
}
