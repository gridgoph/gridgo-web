"use client";

import { Suspense } from "react";

import { SupplierProductList } from "@/components/supplier-products/SupplierProductList";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminSupplierProductsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <SupplierProductList />
    </Suspense>
  );
}
