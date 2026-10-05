"use client";

import { Suspense } from "react";

import { ListingReviewsDesk } from "@/components/listing-reviews/ListingReviewsDesk";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminListingReviewsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <ListingReviewsDesk tree="admin" />
    </Suspense>
  );
}
