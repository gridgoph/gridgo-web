"use client";

import { useCallback, useEffect, useState } from "react";

import { listUsers, listVoucherLedger } from "@/lib/api/client";
import type { User, VoucherCampaign } from "@/lib/api/types";

/**
 * The people a voucher screen names: clients for the lookup, and on Super
 * Admin's log the staff who acted too. The same list the Roles page reads;
 * nothing here shows more about a person than that page does.
 */
export function usePeople(scope: "clients" | "everyone") {
  const [people, setPeople] = useState<User[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      setPeople(await listUsers(scope === "clients" ? "client" : undefined));
    } catch {
      setError(true);
    }
  }, [scope]);
  useEffect(() => {
    void load();
  }, [load]);
  return { people, error, reload: load };
}

export function personLabel(people: User[] | null, id: string | null | undefined): string {
  if (!id) return "System";
  if (people === null) return "…";
  const person = people?.find((row) => row.id === id);
  return person?.name || person?.email || "Unknown account";
}

export type CampaignStats = {
  /** Accounts issued one. Voids and expiry never give a slot back. */
  issued: number;
  /** Used on orders minus given back, as a decimal string of centavos. */
  budgetUsedMinor: string;
};

/**
 * Issued count and net budget for each campaign. The campaign record carries
 * neither, so both come from the activity log: its `total` for `issued`
 * rows, and its `budgetUsedMinor` for the campaign alone.
 */
export function useCampaignStats(campaigns: VoucherCampaign[] | null) {
  const [stats, setStats] = useState<Record<string, CampaignStats | "failed">>({});
  const ids = campaigns?.map((campaign) => campaign.id).join(",") ?? "";

  const load = useCallback(async () => {
    if (!ids) return;
    const entries = await Promise.all(
      ids.split(",").map(async (campaignId) => {
        try {
          const [issued, all] = await Promise.all([
            listVoucherLedger({ campaignId, kind: "issued" }, { limit: 1 }),
            listVoucherLedger({ campaignId }, { limit: 1 }),
          ]);
          return [campaignId, { issued: issued.total, budgetUsedMinor: all.budgetUsedMinor }] as const;
        } catch {
          return [campaignId, "failed"] as const;
        }
      }),
    );
    setStats(Object.fromEntries(entries));
  }, [ids]);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, reload: load };
}
