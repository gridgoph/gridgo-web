"use client";

import { Suspense } from "react";

import { ShopVerificationDesk } from "@/components/shop-verification/ShopVerificationDesk";

/** Shops taking jobs before verification (gridgo-api#411). Operations reads; Super Admin decides. */
export default function ShopVerificationPage() {
  return (
    <Suspense>
      <ShopVerificationDesk canDecide={false} base="/ops" />
    </Suspense>
  );
}
