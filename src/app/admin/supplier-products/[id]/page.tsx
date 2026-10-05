"use client";

import { useParams } from "next/navigation";

import { SupplierProductDetail } from "@/components/supplier-products/SupplierProductDetail";

export default function AdminSupplierProductPage() {
  const params = useParams<{ id: string }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const itemId = decodeURIComponent(raw || "");
  return <SupplierProductDetail itemId={itemId} />;
}
