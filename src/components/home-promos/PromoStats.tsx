"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, MousePointerClick, PanelBottomOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { SkeletonCards } from "@/components/ui/loading";
import { getHomePromoStats, type HomePromo, type HomePromoDay } from "@/lib/api/home-promos";
import { fillDays, homePromoErrorText, manilaDay, rate, statsRange } from "@/lib/home-promos";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

const DAY = new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function dayLabel(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(at) ? day : DAY.format(at);
}

function n(value: number): string {
  return value.toLocaleString("en-PH");
}

/** CSV for partner reporting: one row per Manila day, oldest first. */
export function statsCsv(name: string, days: HomePromoDay[]): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["promo,day,views,sheet_opens,link_taps"];
  for (const d of [...days].reverse()) lines.push([quote(name), d.day, d.views, d.opens, d.taps].join(","));
  return lines.join("\n") + "\n";
}

/**
 * Views, sheet opens and link taps per Manila day, for partner reporting. A
 * view is the card actually shown, counted once per app session per day by
 * the API; opens and taps are every press.
 */
export function PromoStats({ promo }: { promo: HomePromo }) {
  const initial = useMemo(() => statsRange(promo), [promo]);
  const [range, setRange] = useState(initial);
  const [rows, setRows] = useState<HomePromoDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setError(null);
      try {
        setRows(await getHomePromoStats(promo.id, range));
      } catch (err) {
        setError(homePromoErrorText(err, "Could not load the numbers."));
      }
    }, [promo.id, range]),
  );
  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => (rows ? fillDays(range, rows) : null), [rows, range]);
  const totals = useMemo(
    () =>
      (days ?? []).reduce(
        (t, d) => ({ views: t.views + d.views, opens: t.opens + d.opens, taps: t.taps + d.taps }),
        { views: 0, opens: 0, taps: 0 },
      ),
    [days],
  );
  const today = manilaDay(Date.now());
  const rangeValid = range.from <= range.to;

  function download() {
    if (!days) return;
    const blob = new Blob([statsCsv(promo.name, days)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${promo.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "promo"}-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="promo-stats-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="promo-stats-heading" className="text-h3 text-text-primary m-0">
          By day
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-secondary">From</span>
            <Input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
              className="w-40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-secondary">To</span>
            <Input
              type="date"
              value={range.to}
              min={range.from}
              max={today}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
              className="w-40"
            />
          </label>
          <Button variant="outline" onClick={download} disabled={!days || !rangeValid}>
            <Download aria-hidden data-icon="inline-start" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Total icon={Eye} label="Views" value={totals.views} />
        <Total icon={PanelBottomOpen} label="Sheet opens" value={totals.opens} share={rate(totals.opens, totals.views)} />
        <Total icon={MousePointerClick} label="Link taps" value={totals.taps} share={rate(totals.taps, totals.views)} />
      </div>

      {error ? (
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : !days ? (
        <SkeletonCards count={3} lines={1} label="Loading the numbers" />
      ) : (
        <div className="max-h-[28rem] overflow-auto rounded-card border border-outline">
          <table className="w-full border-collapse text-body">
            <caption className="sr-only">Views, sheet opens and link taps by day, Philippine time</caption>
            <thead className="sticky top-0 bg-surface-variant">
              <tr className="text-caption text-text-secondary">
                <th scope="col" className="px-3 py-2 text-left font-normal">Day</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Views</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Opens</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Taps</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className="border-t border-outline-subtle">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-text-primary">
                    {dayLabel(d.day)}
                  </th>
                  <td className={d.views ? "px-3 py-2 text-right tabular-nums text-text-primary" : "px-3 py-2 text-right tabular-nums text-text-muted"}>{n(d.views)}</td>
                  <td className={d.opens ? "px-3 py-2 text-right tabular-nums text-text-primary" : "px-3 py-2 text-right tabular-nums text-text-muted"}>{n(d.opens)}</td>
                  <td className={d.taps ? "px-3 py-2 text-right tabular-nums text-text-primary" : "px-3 py-2 text-right tabular-nums text-text-muted"}>{n(d.taps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Total({
  icon: Icon,
  label,
  value,
  share,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  share?: number | null;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-outline bg-surface p-3">
      <span className="flex items-center gap-1.5 text-caption text-text-secondary">
        <Icon className="size-4" aria-hidden />
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-h2 text-text-primary tabular-nums">{n(value)}</span>
        {share !== undefined && share !== null ? (
          <span className="text-caption text-text-muted tabular-nums" title={`${share}% of views`}>
            {share}%
          </span>
        ) : null}
      </span>
    </div>
  );
}
