"use client";

import { useParams } from "next/navigation";

import { HomePromoEditor } from "@/components/home-promos/HomePromoEditor";

/** `/ops/home-promos/new` adds one; any other id edits that promo. */
export default function OpsHomePromoPage() {
  const params = useParams<{ promoId: string }>();
  const id = decodeURIComponent(params.promoId);
  return <HomePromoEditor tree="ops" promoId={id === "new" ? "new" : id} />;
}
