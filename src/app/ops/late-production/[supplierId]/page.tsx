"use client";

import { useParams } from "next/navigation";

import { ShopLapses } from "@/components/production-lapses/ShopLapses";

export default function OpsShopLapsesPage() {
  const params = useParams<{ supplierId: string }>();
  return <ShopLapses tree="ops" supplierId={decodeURIComponent(params.supplierId)} />;
}
