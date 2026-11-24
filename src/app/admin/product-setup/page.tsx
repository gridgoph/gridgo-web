"use client";

import { Suspense } from "react";

import { ProductSetupDesk } from "@/components/product-templates/team/ProductSetupDesk";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminProductSetupPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <ProductSetupDesk tree="admin" />
    </Suspense>
  );
}
