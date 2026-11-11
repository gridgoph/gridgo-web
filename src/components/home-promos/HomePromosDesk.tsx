"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, MousePointerClick, PanelBottomOpen, Pencil, Plus } from "lucide-react";

import { PromoPreview, type PreviewPromo } from "@/components/home-promos/PromoPreview";
import { useFileUrls } from "@/components/home-promos/useFileUrls";
import { usePromoClock } from "@/components/home-promos/usePromoClock";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { listHomePromos, updateHomePromo, type HomePromo } from "@/lib/api/home-promos";
import {
  TAG_LABEL,
  homePromoErrorText,
  presentHomePromoStatus,
  rotationOrder,
  sortHomePromos,
  withStatusAt,
} from "@/lib/home-promos";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

const DATE = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

function datesText(promo: HomePromo): string {
  const start = Date.parse(promo.startsAt);
  const from = Number.isNaN(start) ? "?" : DATE.format(start);
  if (!promo.endsAt) return `From ${from}`;
  const end = Date.parse(promo.endsAt);
  return `${from} to ${Number.isNaN(end) ? "?" : DATE.format(end)}`;
}

const STATUS_RANK: Record<string, number> = { live: 0, scheduled: 1, off: 2, ended: 3 };

/**
 * Home promos: partner and sponsor cards that rotate with Reorder on the
 * client app's Home. Super Admin and Operations both add, edit, switch off and
 * remove them; the client app re-reads the feed whenever Home opens, so a
 * change needs no release. Beside the list, the rotation clients see now.
 */
export function HomePromosDesk({ tree }: { tree: "ops" | "admin" }) {
  const base = `/${tree}/home-promos`;
  const search = useSearchParams();
  const removed = search.get("removed");
  const [promos, setPromos] = useState<HomePromo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setPromos(await listHomePromos());
      } catch (err) {
        setError(homePromoErrorText(err, "Could not load the promos."));
      } finally {
        setLoading(false);
      }
    }, []),
  );
  useEffect(() => {
    void load();
  }, [load]);
  // Another staff member's edit arrives as an inbox notice; re-read on it.
  useLiveReload("notifications", load);
  const now = usePromoClock(promos ?? [], load);

  async function toggle(promo: HomePromo, enabled: boolean) {
    setToggling(promo.id);
    setToggleError(null);
    try {
      const saved = await updateHomePromo(promo.id, { enabled });
      setPromos((list) => list?.map((p) => (p.id === saved.id ? saved : p)) ?? null);
    } catch (err) {
      setToggleError(homePromoErrorText(err, `Could not switch ${promo.name} ${enabled ? "on" : "off"}.`));
    } finally {
      setToggling(null);
    }
  }

  // Status moves with the clock, not only when the list was read.
  const rows = useMemo(() => sortHomePromos(withStatusAt(promos ?? [], now)), [promos, now]);
  const live = useMemo(() => rotationOrder(promos ?? [], now), [promos, now]);
  const urls = useFileUrls(live.flatMap((p) => [p.logo, p.image]));
  const previews: PreviewPromo[] = live.map((p) => ({
    key: p.id,
    name: p.name,
    logoUrl: p.logo ? urls[p.logo.fileId] ?? null : null,
    imageUrl: p.image ? urls[p.image.fileId] ?? null : null,
    description: p.description,
    tag: p.tag,
    linkText: p.linkText,
    linkUrl: p.linkUrl,
    tapAction: p.tapAction,
    color: p.color,
  }));

  const columns = useMemo<DataTableColumn<HomePromo>[]>(
    () => [
      {
        id: "promo",
        header: "Promo",
        primary: true,
        sortValue: (row) => row.name,
        filterValue: (row) => `${row.name} ${TAG_LABEL[row.tag]}`,
        cell: (row) => (
          <Link href={`${base}/${encodeURIComponent(row.id)}`} className="flex min-w-0 items-center gap-3 hover:underline">
            <PromoLogo promo={row} />
            <span className="flex min-w-0 flex-col">
              <span className="text-body truncate text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                {row.name}
              </span>
              <span className="text-caption truncate text-text-muted">{TAG_LABEL[row.tag]}</span>
            </span>
          </Link>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => STATUS_RANK[row.status] ?? 4,
        cell: (row) => {
          const s = presentHomePromoStatus(row.status);
          return <StatusChip tone={s.tone} label={s.label} icon={s.icon} />;
        },
      },
      {
        id: "dates",
        header: "Dates",
        sortValue: (row) => Date.parse(row.startsAt) || 0,
        cell: (row) => {
          // Start and end on their own lines, so times never squeeze the counts.
          const [from, to] = datesText(row).split(" to ");
          return (
            <span className="flex flex-col text-body text-text-secondary">
              <span className="whitespace-nowrap">{from}</span>
              {to ? <span className="whitespace-nowrap">to {to}</span> : null}
            </span>
          );
        },
      },
      {
        id: "order",
        header: "Order",
        hideOnMobile: true,
        sortValue: (row) => row.displayOrder,
        cell: (row) => <span className="text-body text-text-secondary tabular-nums">{row.displayOrder}</span>,
      },
      {
        id: "views",
        header: "Views",
        sortValue: (row) => row.views,
        cell: (row) => <Metric icon={Eye} value={row.views} label="views" />,
      },
      {
        id: "opens",
        header: "Opens",
        sortValue: (row) => row.opens,
        cell: (row) => <Metric icon={PanelBottomOpen} value={row.opens} label="sheet opens" />,
      },
      {
        id: "taps",
        header: "Taps",
        sortValue: (row) => row.taps,
        cell: (row) => <Metric icon={MousePointerClick} value={row.taps} label="link taps" />,
      },
    ],
    [base],
  );

  const addButton = (
    <Button variant="primary" nativeButton={false} render={<Link href={`${base}/new`} />}>
      <Plus aria-hidden data-icon="inline-start" />
      New promo
    </Button>
  );

  let body: React.ReactNode;
  if (error && !promos) {
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
  } else if (loading && !promos) {
    body = <DataTable columns={columns} data={[]} loading getRowId={(r) => r.id} caption="Home promos" />;
  } else if (!rows.length) {
    body = (
      <EmptyState
        title="No Home promos yet"
        body="Add a partner's card. It rotates with Reorder on the client's Home."
        action={addButton}
      />
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        caption="Home promos"
        filterPlaceholder="Filter by name…"
        itemLabel="promos"
        toolbar={addButton}
        defaultSortId="status"
        defaultSortDirection="asc"
        rowActions={(row) => (
          // The switch sits with the pinned actions so a wide row never hides it.
          <span className="flex items-center gap-2">
            <Switch
              checked={row.enabled}
              disabled={toggling === row.id}
              onCheckedChange={(checked) => void toggle(row, checked)}
              aria-label={`${row.name} ${row.enabled ? "on" : "off"}`}
            />
            <DataTableRowAction label="Edit" icon={Pencil} href={`${base}/${encodeURIComponent(row.id)}`} />
          </span>
        )}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-3">
        {removed ? (
          <Alert>
            <AlertDescription>{removed} was removed from Home.</AlertDescription>
          </Alert>
        ) : null}
        {toggleError ? (
          <Alert variant="destructive">
            <AlertDescription>{toggleError}</AlertDescription>
          </Alert>
        ) : null}
        {body}
      </div>
      <aside className="flex flex-col items-center gap-2 lg:sticky lg:top-3 lg:self-start" aria-labelledby="home-now">
        <h2 id="home-now" className="text-h3 text-text-primary m-0">
          On Home now
        </h2>
        <PromoPreview promos={previews} />
        {promos && !live.length ? (
          <p className="text-caption m-0 max-w-[18rem] text-center text-text-muted">No live promo. Clients see Reorder only.</p>
        ) : null}
      </aside>
    </div>
  );
}

function PromoLogo({ promo }: { promo: HomePromo }) {
  const urls = useFileUrls([promo.logo]);
  const url = promo.logo ? urls[promo.logo.fileId] : null;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-pill border border-outline bg-surface-high">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-contain p-0.5" />
      ) : (
        <span className="text-caption text-text-muted" style={{ fontFamily: "var(--font-bold)" }}>
          {promo.name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Eye; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-body text-text-primary tabular-nums" aria-label={`${value.toLocaleString("en-PH")} ${label}`}>
      <Icon className="size-4 text-text-muted" aria-hidden />
      {value.toLocaleString("en-PH")}
    </span>
  );
}
