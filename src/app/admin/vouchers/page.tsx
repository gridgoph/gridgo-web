"use client";

import { Suspense } from "react";

import { VouchersDesk } from "@/components/vouchers/VouchersDesk";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function AdminVouchersPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading vouchers…" />}>
      <VouchersDesk />
    </Suspense>
  );
}
