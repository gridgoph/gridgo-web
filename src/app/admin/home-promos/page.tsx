"use client";

import { Suspense } from "react";

import { HomePromosDesk } from "@/components/home-promos/HomePromosDesk";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function AdminHomePromosPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading Home promos…" />}>
      <HomePromosDesk tree="admin" />
    </Suspense>
  );
}
