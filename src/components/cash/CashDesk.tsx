"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { IncidentsPanel } from "@/components/cash/IncidentsPanel";
import { LedgerPanel } from "@/components/cash/LedgerPanel";
import { TopupsPanel } from "@/components/cash/TopupsPanel";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listCashIncidents,
  listCashTopups,
  type CashIncident,
  type CashTopupRow,
} from "@/lib/api/cash";
import { listIssues, listOrders, listUsers } from "@/lib/api/client";
import type { Issue, Order } from "@/lib/api/types";
import {
  CASH_TABS,
  isCashOrder,
  noShowWaiting,
  redeliveryWaiting,
  remedyCases,
  repaymentWaiting,
  tabFromSearch,
  waitingTopups,
  type CashTab,
} from "@/lib/cash";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { useLiveReload } from "@/lib/live/useLiveReload";

export type DeskData = {
  topups: CashTopupRow[];
  orders: Order[];
  incidents: CashIncident[];
  /** Null when the problem reports could not be read; remedies say so. */
  issues: Issue[] | null;
  riderNames: Map<string, string>;
};

export type DeskContext = {
  /** `/ops` or `/admin`: orders open in the caller's own tree. */
  base: "/ops" | "/admin";
  superAdmin: boolean;
  riderName: (id: string | null | undefined) => string;
  reload: () => Promise<void>;
};

/**
 * Cash on delivery for Operations and Super Admin: rider top-ups to check
 * against the bank, cash incidents to decide, and the wallets and ledger
 * with the API's reconciliation. One component for both trees.
 */
export function CashDesk() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = tabFromSearch(search.get("tab"));
  const base = pathname.startsWith("/admin") ? "/admin" : "/ops";

  const [data, setData] = useState<DeskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const [topups, incidents, orders, issues, riders] = await Promise.all([
        listCashTopups(),
        listCashIncidents(),
        listOrders(),
        listIssues().catch(() => null),
        listUsers("rider").catch(() => []),
      ]);
      if (mine !== generation.current) return;
      setData({
        topups,
        incidents,
        orders: orders.filter(isCashOrder),
        issues,
        riderNames: new Map(riders.map((rider) => [rider.id, rider.name])),
      });
      setError(null);
    } catch (err) {
      if (mine !== generation.current) return;
      setError(opsErrorMessage(err, "Could not load cash on delivery. Try again."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // Top-up notices carry no order; cash order changes ping `orders`.
  useLiveReload(["orders", "notifications"], load);

  const riderName = useCallback(
    (id: string | null | undefined) =>
      (id && data?.riderNames.get(id)) || (id ? "Rider not on record" : "No rider"),
    [data],
  );

  const ctx: DeskContext = useMemo(
    () => ({ base, superAdmin: base === "/admin", riderName, reload: load }),
    [base, riderName, load],
  );

  function setTab(next: CashTab) {
    const params = new URLSearchParams(search.toString());
    if (next === "topups") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  if (error && !data) {
    return (
      <ErrorState
        title="Could not load cash on delivery"
        body={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }
  if (!data) {
    return <SkeletonCards count={3} lines={3} label="Loading cash on delivery" className="gap-3" />;
  }

  const counts: Record<CashTab, number | null> = {
    topups: waitingTopups(data.topups),
    incidents:
      data.orders.filter((o) => noShowWaiting(o) || repaymentWaiting(o) || redeliveryWaiting(o))
        .length +
      data.incidents.filter((i) => i.status === "outstanding").length +
      remedyCases(data.orders, data.issues ?? []).filter((c) =>
        ["ready", "reserved", "unknown"].includes(c.stage),
      ).length,
    ledger: null,
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Riders pay shops in cash and collect from clients. Their wallets hold GRIDGO&rsquo;s share
        until delivery. Check every top-up against the bank before confirming it, and decide
        cash incidents from the evidence. Times are Manila time.
      </p>
      {error ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-error bg-surface px-4 py-2"
          role="alert"
        >
          <span className="text-body text-text-primary">{error}</span>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}
      <Tabs value={tab} onValueChange={(value) => setTab(value as CashTab)}>
        <TabsList className="flex-wrap">
          {CASH_TABS.map((choice) => {
            const count = counts[choice.value];
            return (
              <TabsTrigger
                key={choice.value}
                value={choice.value}
                className="min-h-11"
                aria-label={
                  count ? `${choice.label}, ${count} waiting` : choice.label
                }
              >
                {choice.label}
                {count ? (
                  <span className="tabular-nums text-text-secondary" aria-hidden>
                    {count}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="topups" className="mt-4">
          <TopupsPanel data={data} ctx={ctx} />
        </TabsContent>
        <TabsContent value="incidents" className="mt-4">
          <IncidentsPanel data={data} ctx={ctx} />
        </TabsContent>
        <TabsContent value="ledger" className="mt-4">
          {tab === "ledger" ? <LedgerPanel data={data} ctx={ctx} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
