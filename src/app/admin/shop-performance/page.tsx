"use client";

import { Suspense } from "react";

import { ShopPerformanceList } from "@/components/shop-performance/ShopPerformanceList";
import { SkeletonLines } from "@/components/ui/loading";

export default function AdminShopPerformancePage() {
  return (
    <Suspense fallback={<SkeletonLines lines={6} />}>
      <ShopPerformanceList tree="admin" />
    </Suspense>
  );
}
