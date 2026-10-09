"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

import { CampaignEditor } from "@/components/vouchers/CampaignEditor";
import { useCampaignStats, type CampaignStats } from "@/components/vouchers/data";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Progress } from "@/components/ui/progress";
import { StatusChip } from "@/components/ui/StatusChip";
import { listVoucherCampaigns } from "@/lib/api/client";
import type { VoucherCampaign } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  MODE_COPY,
  formatMinorString,
  presentCampaignStatus,
  validityText,
  voucherErrorMessage,
} from "@/lib/vouchers";

const STATUS_ORDER = { active: 0, paused: 1, draft: 2, ended: 3 } as const;

/**
 * Every campaign, live ones first. Each row shows how far it has gone against
 * its limit and what it has cost so far; the row opens the campaign, where it
 * is launched, issued, paused or ended.
 */
export function CampaignList() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<VoucherCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { stats } = useCampaignStats(campaigns);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setCampaigns(await listVoucherCampaigns());
      } catch (err) {
        setError(voucherErrorMessage(err, "Could not load the campaigns. Try again."));
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      [...(campaigns ?? [])].sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    [campaigns],
  );

  const columns = useMemo<DataTableColumn<VoucherCampaign>[]>(
    () => [
      {
        id: "campaign",
        header: "Campaign",
        primary: true,
        sortValue: (row) => row.name,
        filterValue: (row) => `${row.name} ${row.mode === "shared" ? row.code : ""}`,
        cell: (row) => (
          <div className="min-w-0">
            <p
              className="text-body text-text-primary m-0 truncate"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {row.name}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
              {row.mode === "shared" ? `Code ${row.code}` : MODE_COPY[row.mode].label}
            </p>
          </div>
        ),
      },
      {
        id: "value",
        header: "Value",
        sortValue: (row) => row.valueMinor,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums">{formatPhp(row.valueMinor)}</span>
        ),
      },
      {
        id: "validity",
        header: "Each lasts",
        hideOnMobile: true,
        sortValue: (row) => row.validityDays ?? 0,
        cell: (row) => <span className="text-body text-text-secondary">{validityText(row)}</span>,
      },
      {
        id: "issued",
        header: "Issued",
        sortValue: (row) => {
          const s = stats[row.id];
          return s && s !== "failed" ? s.issued / row.totalLimit : -1;
        },
        cell: (row) => <IssuedCell campaign={row} stats={stats[row.id]} />,
      },
      {
        id: "budget",
        header: "Budget used",
        sortValue: (row) => {
          const s = stats[row.id];
          return s && s !== "failed" ? Number(s.budgetUsedMinor) : -1;
        },
        cell: (row) => {
          const s = stats[row.id];
          return (
            <span className="text-body text-text-secondary tabular-nums">
              {s === undefined ? "…" : s === "failed" ? "Not loaded" : formatMinorString(s.budgetUsedMinor)}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => STATUS_ORDER[row.status],
        cell: (row) => {
          const status = presentCampaignStatus(row.status);
          return <StatusChip tone={status.tone} label={status.label} icon={status.icon} />;
        },
      },
    ],
    [stats],
  );

  const newButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      New campaign
    </Button>
  );

  let body: React.ReactNode;
  if (loading && !campaigns) {
    body = (
      <DataTable columns={columns} data={[]} loading getRowId={(row) => row.id} caption="Voucher campaigns" />
    );
  } else if (error && !campaigns) {
    body = (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  } else if (!rows.length) {
    body = (
      <EmptyState
        title="No voucher campaigns yet"
        body="Create one to thank soft-launch testers with ₱15 off GRIDGO's fees, or to run a code clients type in the app."
        action={newButton}
      />
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Voucher campaigns"
        filterPlaceholder="Filter by name or code…"
        itemLabel="campaigns"
        toolbar={newButton}
        rowActions={(row) => (
          <DataTableRowAction
            label="Open"
            icon={Eye}
            href={`/admin/vouchers/${encodeURIComponent(row.id)}`}
          />
        )}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Vouchers are GRIDGO&rsquo;s money. They come off GRIDGO&rsquo;s service fee, then
        delivery, never the shop&rsquo;s price, so shop payouts and rider pay never change.
        An order takes one voucher, or the organization discount if that saves more.
      </p>
      {body}
      <CampaignEditor
        editing={creating ? "new" : null}
        onClose={() => setCreating(false)}
        onStale={() => void load()}
        onSaved={(campaign) => {
          setCreating(false);
          router.push(`/admin/vouchers/${encodeURIComponent(campaign.id)}?created=1`);
        }}
      />
    </div>
  );
}

function IssuedCell({
  campaign,
  stats,
}: {
  campaign: VoucherCampaign;
  stats: CampaignStats | "failed" | undefined;
}) {
  if (stats === undefined) return <span className="text-body text-text-muted">…</span>;
  if (stats === "failed") return <span className="text-body text-text-muted">Not loaded</span>;
  const share = Math.min(100, (stats.issued / campaign.totalLimit) * 100);
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="text-body text-text-secondary tabular-nums">
        {stats.issued.toLocaleString("en-PH")} of {campaign.totalLimit.toLocaleString("en-PH")}
      </span>
      <Progress
        value={share}
        aria-label={`${stats.issued} of ${campaign.totalLimit} issued`}
        className="w-28"
      />
    </div>
  );
}
