"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Bell, ChevronRight, Clock3, Moon, Pause, QrCode, Zap, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/loading";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  hoursLine,
  isPaused,
  NIGHT_CHOICES,
  PAUSE_CHOICES,
  pauseLine,
  type MyShopStatus,
  type MyShopStatusPatch,
  type NightJobs,
} from "@/lib/my-shop-status";
import { cn } from "@/lib/utils";

function Row({
  icon: Icon,
  title,
  hint,
  titleId,
  control,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  titleId?: string;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 border-b border-outline-subtle py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <Icon aria-hidden className="size-5 shrink-0 text-text-secondary" strokeWidth={1.75} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span id={titleId} className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            {title}
          </span>
          {hint ? <span className="text-caption text-text-muted">{hint}</span> : null}
        </div>
        {control}
      </div>
      {children ? <div className="pl-8">{children}</div> : null}
    </li>
  );
}

function LinkRow({
  icon: Icon,
  href,
  title,
  line,
}: {
  icon: LucideIcon;
  href: string;
  title: string;
  line: string;
}) {
  return (
    <li className="border-b border-outline-subtle last:border-b-0">
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 py-2 no-underline hover:bg-overlay-hover"
      >
        <Icon aria-hidden className="size-5 shrink-0 text-text-secondary" strokeWidth={1.75} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            {title}
          </span>
          <span className="text-caption text-text-muted truncate">{line}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-muted" />
      </Link>
    </li>
  );
}

/**
 * Shop status (the phone's status sheet, as a panel): Express, night jobs,
 * demand pings, pause, hours and where the shop gets paid. Every control
 * saves as it is touched. The API lets only the Owner write these this
 * release, so everyone else reads them with one line saying so; only the
 * Owner sees where the shop gets paid.
 */
export function ShopStatusPanel({
  status,
  loading,
  canEdit,
  canEditHours,
  busy,
  message,
  payoutLine,
  onSave,
  now = new Date(),
}: {
  status: MyShopStatus | null;
  loading: boolean;
  canEdit: boolean;
  canEditHours: boolean;
  busy: boolean;
  message: { tone: "ok" | "error"; text: string } | null;
  /** Owner only. Null hides the row. */
  payoutLine: string | null;
  onSave: (patch: MyShopStatusPatch) => void;
  now?: Date;
}) {
  const ids = useId();
  const paused = status ? isPaused(status, now) : false;
  const nightOn = status ? status.nightJobs !== "off" : false;
  const locked = !canEdit || busy;

  return (
    <section
      aria-labelledby={`${ids}-h`}
      data-testid="shop-status-panel"
      className="flex flex-col rounded-card border border-outline bg-surface p-4"
    >
      <h2 id={`${ids}-h`} className="text-h3 text-text-primary m-0">
        Shop status
      </h2>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("text-body m-0 mt-1", message.tone === "error" ? "text-error" : "text-text-secondary")}
        >
          {message.text}
        </p>
      ) : !canEdit && status ? (
        <p className="text-caption text-text-muted m-0 mt-1">Only the shop owner can change these.</p>
      ) : null}

      {loading && !status ? <SkeletonLines lines={6} className="mt-3" /> : null}

      {status ? (
        <ul className="m-0 mt-1 flex list-none flex-col p-0">
          <Row
            icon={Zap}
            title="Express jobs"
            hint="Documents in minutes"
            titleId={`${ids}-express`}
            control={
              <Switch
                checked={status.expressEnabled}
                disabled={locked}
                aria-labelledby={`${ids}-express`}
                onCheckedChange={(next) => onSave({ expressEnabled: Boolean(next) })}
              />
            }
          />
          <Row
            icon={Moon}
            title="Night jobs"
            hint="Express documents after closing time. Pickup only when riders are off duty."
            titleId={`${ids}-night`}
            control={
              <Switch
                checked={nightOn}
                disabled={locked}
                aria-labelledby={`${ids}-night`}
                onCheckedChange={(next) => onSave({ nightJobs: next ? "until_21" : "off" })}
              />
            }
          >
            {nightOn ? (
              <ToggleGroup
                aria-label="Night jobs until"
                value={[status.nightJobs]}
                disabled={locked}
                onValueChange={(value: string[]) => {
                  const next = value[0] as NightJobs | undefined;
                  if (next && next !== status.nightJobs) onSave({ nightJobs: next });
                }}
                className="flex-wrap"
              >
                {NIGHT_CHOICES.map((choice) => (
                  <ToggleGroupItem key={choice.value} value={choice.value} variant="outline">
                    {choice.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : null}
          </Row>
          <Row
            icon={Bell}
            title="Ping me when clients need a printer"
            hint="During night jobs, at most 3 a night"
            titleId={`${ids}-pings`}
            control={
              <Switch
                checked={status.printerDemandPings}
                disabled={locked}
                aria-labelledby={`${ids}-pings`}
                onCheckedChange={(next) => onSave({ printerDemandPings: Boolean(next) })}
              />
            }
          />
          <Row
            icon={Pause}
            title={paused ? pauseLine(status.pausedUntil as string, now) : "Pause shop"}
            hint="Jobs you already have still finish."
          >
            <div className="flex flex-wrap gap-2">
              {paused ? (
                <Button variant="secondary" disabled={locked} onClick={() => onSave({ pause: null })}>
                  Resume now
                </Button>
              ) : (
                PAUSE_CHOICES.map((choice) => (
                  <Button
                    key={choice.value}
                    variant="outline"
                    disabled={locked}
                    onClick={() => onSave({ pause: choice.value })}
                  >
                    {choice.label}
                  </Button>
                ))
              )}
            </div>
          </Row>
          {canEditHours ? (
            <LinkRow icon={Clock3} href="/supplier/shop-hours" title="Hours" line={hoursLine(status)} />
          ) : (
            <Row icon={Clock3} title="Hours" hint={hoursLine(status)} />
          )}
          {payoutLine !== null ? (
            <LinkRow
              icon={QrCode}
              href="/supplier/payout-account"
              title="Where you get paid"
              line={payoutLine}
            />
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
