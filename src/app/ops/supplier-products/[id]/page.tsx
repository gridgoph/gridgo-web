"use client";

import { useParams } from "next/navigation";

import { SupplierProductDetail } from "@/components/supplier-products/SupplierProductDetail";

/**
 * A listing as Operations reads it, opened from the Production time tab of
 * Listing reviews. Read-only: taking a listing down is Super Admin's.
 */
export default function OpsSupplierProductPage() {
  const params = useParams<{ id: string }>();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  const itemId = decodeURIComponent(raw || "");
  return (
    <SupplierProductDetail
      itemId={itemId}
      canTakeDown={false}
      back={{ href: "/ops/listing-reviews?tab=production-time", label: "Listings to check" }}
    />
  );
}
