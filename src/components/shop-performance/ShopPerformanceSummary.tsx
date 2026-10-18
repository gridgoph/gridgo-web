"use client";

/**
 * A shop's performance in one strip, for the other per-shop pages: Top Pick,
 * roster review, on-time rate and the last 30 days' late finishes and
 * warnings, with a link to the full record. Best effort: when it cannot be
 * read it says so and the host page carries on.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  shopPerformanceHref,
  type PerformanceTree,
} from "@/components/shop-performance/paths";
import { StatusChip } from "@/components/ui/StatusChip";
import { getShopPerformance } from "@/lib/api/client";
import type { SupplierPerformance } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  PERFORMANCE_WINDOW_DAYS,
  ROSTER_REVIEW_CHIP,
  onTimeDetail,
  onTimeRateText,
  topPickChip,
} from "@/lib/supplier-performance";

export function ShopPerformanceSummary({
  tree,
  supplierId,
}: {
  tree: PerformanceTree;
  supplierId: string;
}) {
  const [performance, setPerformance] = useState<SupplierPerformance | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setPerformance(await getShopPerformance(supplierId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(["jobs"], load);

  const href = shopPerformanceHref(tree, supplierId);
  if (failed) {
    return (
      <p className="text-caption text-text-muted m-0" data-testid="performance-strip">
        This shop&rsquo;s performance could not be read here.{" "}
        <Link href={href} className="underline underline-offset-2">
          Open shop performance
        </Link>
        .
      </p>
    );
  }
  if (!performance) return null;
  const chip = topPickChip(performance.topPick);
  const rate = onTimeRateText(performance.onTime);
  return (
    <div
      className="flex flex-col gap-2 rounded-card border border-outline px-4 py-3"
      data-testid="performance-strip"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
        {performance.rosterReview ? (
          <StatusChip
            tone={ROSTER_REVIEW_CHIP.tone}
            label={ROSTER_REVIEW_CHIP.label}
            icon={ROSTER_REVIEW_CHIP.icon}
          />
        ) : null}
      </div>
      <p className="text-body text-text-secondary m-0">
        Last {PERFORMANCE_WINDOW_DAYS} days: {rate ? `${rate} on time (${onTimeDetail(performance.onTime).toLowerCase()})` : onTimeDetail(performance.onTime).toLowerCase()},{" "}
        {performance.counts.lateFinishes === 1
          ? "1 late finish"
          : `${performance.counts.lateFinishes} late finishes`}
        ,{" "}
        {performance.warnings.length === 1 ? "1 warning" : `${performance.warnings.length} warnings`}.{" "}
        <Link href={href} className="text-text-primary underline underline-offset-2">
          Open shop performance
        </Link>
      </p>
    </div>
  );
}
