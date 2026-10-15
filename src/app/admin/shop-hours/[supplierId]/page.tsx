"use client";

import { useParams } from "next/navigation";

import { ShopHoursDetail } from "@/components/shop-hours/ShopHoursDetail";

export default function AdminShopHoursDetailPage() {
  const params = useParams<{ supplierId: string }>();
  return <ShopHoursDetail tree="admin" supplierId={decodeURIComponent(params.supplierId)} />;
}
