"use client";

import { useParams } from "next/navigation";

import { ShopTemplateProducts } from "@/components/product-templates/team/ShopTemplateProducts";

export default function OpsShopTemplateProductsPage() {
  const params = useParams<{ supplierId: string }>();
  const raw = Array.isArray(params.supplierId) ? params.supplierId[0] : params.supplierId;
  return <ShopTemplateProducts tree="ops" supplierId={decodeURIComponent(raw || "")} />;
}
