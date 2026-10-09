"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { CampaignDetail } from "@/components/vouchers/CampaignDetail";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function AdminVoucherCampaignPage() {
  const params = useParams<{ campaignId: string }>();
  return (
    <Suspense fallback={<LoadingBlock label="Loading campaign…" />}>
      <CampaignDetail campaignId={decodeURIComponent(params.campaignId)} />
    </Suspense>
  );
}
