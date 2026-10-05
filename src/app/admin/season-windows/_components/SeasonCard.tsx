import { Pencil, Trash2 } from "lucide-react";

import {
  bannerTiming,
  noticeLine,
  seasonLength,
  seasonRange,
} from "@/app/admin/_lib/season-windows";
import {
  SeasonLevelTag,
  SeasonRunway,
} from "@/app/admin/season-windows/_components/SeasonVisuals";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SeasonPushDryRunWindow, SeasonWindow } from "@/lib/api/types";


/** One season: what it says, when it runs, and when clients hear about it. */
export function SeasonCard({
  window,
  today,
  dry,
  pushEnabled,
  onEdit,
  onDelete,
}: {
  window: SeasonWindow;
  today: string;
  dry: SeasonPushDryRunWindow | undefined;
  pushEnabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const timing = bannerTiming(window.banner, today);
  const notice = noticeLine(window, dry, pushEnabled, timing.phase);
  const days = seasonLength(window.startDate, window.endDate);
  const headingId = `season-${window.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3
            id={headingId}
            className="text-body-lg text-text-primary m-0 min-w-0 break-words pt-2"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            {window.name}
          </h3>
          <div className="flex shrink-0 gap-1">
            <CardActions name={window.name} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SeasonLevelTag level={window.demandLevel} />
          <span className="text-body text-text-secondary">
            {seasonRange(window.startDate, window.endDate)}
            <span className="text-text-muted">
              {" "}
              ({days} day{days === 1 ? "" : "s"})
            </span>
          </span>
        </div>
        <p className="text-body text-text-secondary m-0 max-w-prose whitespace-pre-line break-words">
          {window.message}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {window.status !== "past" ? (
          <SeasonRunway
            bannerStart={window.banner.startDate}
            bannerEnd={window.banner.endDate}
            startDate={window.startDate}
            endDate={window.endDate}
            level={window.demandLevel}
            today={today}
          />
        ) : null}
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2">
          <dt className="text-caption text-text-muted">Home banner</dt>
          <dd className="m-0 flex flex-col items-start gap-1">
            <StatusChip tone={timing.tone} icon={timing.icon} label={timing.chip} />
            <span className="text-caption text-text-secondary">{timing.headline}</span>
          </dd>
          <dt className="text-caption text-text-muted">Notice</dt>
          <dd className="m-0 flex flex-col items-start gap-1">
            <StatusChip tone={notice.tone} icon={notice.icon} label={notice.label} />
            <span className="text-caption text-text-secondary">{notice.detail}</span>
          </dd>
        </dl>
      </div>
    </article>
  );
}

function CardActions({
  name,
  onEdit,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${name}`}>
        <Pencil aria-hidden />
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-text-secondary"
        onClick={onDelete}
        aria-label={`Delete ${name}`}
      >
        <Trash2 aria-hidden />
        Delete
      </Button>
    </>
  );
}
