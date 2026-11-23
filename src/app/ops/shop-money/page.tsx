"use client";

import { Suspense } from "react";

import { ShopMoneyDesk } from "@/components/shop-money/ShopMoneyDesk";

/** Shop balances, the daily payout run and Pay GRIDGO (gridgo-api#416). */
export default function ShopMoneyPage() {
  return (
    <Suspense>
      <ShopMoneyDesk base="/ops" superAdmin={false} />
    </Suspense>
  );
}
