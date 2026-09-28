"use client";

import { Suspense } from "react";

import { RefundInbox } from "@/components/refunds/RefundInbox";
import { SkeletonCards } from "@/components/ui/loading";

export default function AdminRefundsPage() {
  return (
    <Suspense fallback={<SkeletonCards count={3} lines={2} label="Loading refunds" className="gap-3" />}>
      <RefundInbox tree="admin" />
    </Suspense>
  );
}
