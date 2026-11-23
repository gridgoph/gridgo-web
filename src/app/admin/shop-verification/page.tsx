"use client";

import { Suspense } from "react";

import { ShopVerificationDesk } from "@/components/shop-verification/ShopVerificationDesk";

/** Shops taking jobs before verification (gridgo-api#411). Super Admin decides here. */
export default function ShopVerificationPage() {
  return (
    <Suspense>
      <ShopVerificationDesk canDecide={true} base="/admin" />
    </Suspense>
  );
}
