"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CampaignList } from "@/components/vouchers/CampaignList";
import { usePeople } from "@/components/vouchers/data";
import { VoucherLedger } from "@/components/vouchers/VoucherLedger";
import { VoucherLookup } from "@/components/vouchers/VoucherLookup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listVoucherCampaigns } from "@/lib/api/client";
import type { VoucherCampaign } from "@/lib/api/types";

type DeskTab = "campaigns" | "activity" | "lookup";

function deskTab(value: string | null): DeskTab {
  return value === "activity" || value === "lookup" ? value : "campaigns";
}

/**
 * Super Admin's vouchers: campaigns, the activity log with its budget and
 * CSV, and the same client lookup Operations has, with void and reissue.
 * The tab and the client live in the URL so a log row, a report row or an
 * inbox notice can open the exact view.
 */
export function VouchersDesk() {
  const router = useRouter();
  const search = useSearchParams();
  const tab = deskTab(search.get("tab"));
  const clientId = search.get("client") ?? "";
  const { people } = usePeople("everyone");
  const [campaigns, setCampaigns] = useState<VoucherCampaign[] | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      setCampaigns(await listVoucherCampaigns());
    } catch {
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    if (tab === "activity") void loadCampaigns();
  }, [tab, loadCampaigns]);

  const go = useCallback(
    (next: { tab?: DeskTab; client?: string }) => {
      const params = new URLSearchParams(search.toString());
      if (next.tab) params.set("tab", next.tab);
      if (next.client !== undefined) {
        if (next.client) params.set("client", next.client);
        else params.delete("client");
      }
      params.delete("created");
      router.replace(`/admin/vouchers?${params.toString()}`, { scroll: false });
    },
    [router, search],
  );

  return (
    <Tabs value={tab} onValueChange={(value) => go({ tab: deskTab(String(value)) })}>
      <TabsList>
        <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        <TabsTrigger value="activity">Activity log</TabsTrigger>
        <TabsTrigger value="lookup">Look up a client</TabsTrigger>
      </TabsList>
      <TabsContent value="campaigns" className="mt-4">
        <CampaignList />
      </TabsContent>
      <TabsContent value="activity" className="mt-4">
        {tab === "activity" ? (
          <VoucherLedger
            campaigns={campaigns}
            people={people}
            initialClientId={clientId}
            onClientChange={(client) => go({ client })}
          />
        ) : null}
      </TabsContent>
      <TabsContent value="lookup" className="mt-4">
        {tab === "lookup" ? (
          <VoucherLookup tree="admin" clientId={clientId} onClientChange={(client) => go({ client })} />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
