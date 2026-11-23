"use client";

import { useParams } from "next/navigation";

import { ShopTemplateProducts } from "@/components/product-templates/team/ShopTemplateProducts";

export default function AdminShopTemplateProductsPage() {
  const params = useParams<{ supplierId: string }>();
  const raw = Array.isArray(params.supplierId) ? params.supplierId[0] : params.supplierId;
  return <ShopTemplateProducts tree="admin" supplierId={decodeURIComponent(raw || "")} />;
}
