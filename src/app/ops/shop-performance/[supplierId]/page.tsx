"use client";

import { useParams } from "next/navigation";

import { ShopPerformanceDetail } from "@/components/shop-performance/ShopPerformanceDetail";

export default function OpsShopPerformanceDetailPage() {
  const params = useParams<{ supplierId: string }>();
  return (
    <ShopPerformanceDetail tree="ops" supplierId={decodeURIComponent(params.supplierId)} />
  );
}
