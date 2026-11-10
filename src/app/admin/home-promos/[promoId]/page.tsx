"use client";

import { useParams } from "next/navigation";

import { HomePromoEditor } from "@/components/home-promos/HomePromoEditor";

/** `/admin/home-promos/new` adds one; any other id edits that promo. */
export default function AdminHomePromoPage() {
  const params = useParams<{ promoId: string }>();
  const id = decodeURIComponent(params.promoId);
  return <HomePromoEditor tree="admin" promoId={id === "new" ? "new" : id} />;
}
