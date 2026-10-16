"use client";

import { useParams } from "next/navigation";

import { ShopHoursDetail } from "@/components/shop-hours/ShopHoursDetail";

export default function OpsShopHoursDetailPage() {
  const params = useParams<{ supplierId: string }>();
  return <ShopHoursDetail tree="ops" supplierId={decodeURIComponent(params.supplierId)} />;
}
