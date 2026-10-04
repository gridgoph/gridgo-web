"use client";

import { useParams } from "next/navigation";

import { ShopLapses } from "@/components/production-lapses/ShopLapses";

export default function AdminShopLapsesPage() {
  const params = useParams<{ supplierId: string }>();
  return <ShopLapses tree="admin" supplierId={decodeURIComponent(params.supplierId)} />;
}
