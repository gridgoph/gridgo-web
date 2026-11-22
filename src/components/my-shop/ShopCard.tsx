"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  nightChipLabel,
  signOf,
  type MyShopStatus,
  type MyShopStatusPatch,
} from "@/lib/my-shop-status";
import { cn } from "@/lib/utils";

/**
 * The shop itself: its name, the Express and night chips, and the hanging
 * OPEN / CLOSED sign with the one fact that goes with it. The Owner can press
 * the sign: an open shop asks first, then closes; a closed or paused shop
 * opens; a shop closed by its hours goes to its hours.
 */
export function ShopCard({
  name,
  status,
  canEdit,
  canEditHours,
  busy,
  onSave,
  now = new Date(),
}: {
  name: string;
  status: MyShopStatus | null;
  canEdit: boolean;
  canEditHours: boolean;
  busy: boolean;
  onSave: (patch: MyShopStatusPatch) => void;
  now?: Date;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const sign = status ? signOf(status, now) : null;
  const night = status ? nightChipLabel(status.nightJobs) : null;

  function press() {
    if (!sign) return;
    if (sign.action === "close") setConfirmClose(true);
    else if (sign.action === "open") onSave({ temporarilyClosed: false });
    else if (sign.action === "resume") onSave({ pause: null });
  }

  const signFace = sign ? (
    <>
      <span
        className="text-h2 leading-none tracking-[0.12em]"
        style={{ fontFamily: "var(--font-black)" }}
      >
        {sign.word}
      </span>
      <span className="text-caption text-text-secondary">{sign.line}</span>
    </>
  ) : null;

  const signClass = cn(
    "flex min-w-40 flex-col items-center gap-1 rounded-field border-2 bg-surface px-5 py-3",
    sign?.open ? "border-success text-success" : "border-text-primary text-text-primary",
  );

  return (
    <section
      aria-labelledby="my-shop-name"
      data-testid="shop-card"
      className="flex flex-col gap-4 rounded-card border border-outline bg-surface p-4 md:flex-row md:items-center md:p-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 id="my-shop-name" className="text-h2 text-text-primary m-0 truncate">
          {name}
        </h2>
        {status ? (
          <div className="flex flex-wrap gap-2">
            <StatusChip
              tone={status.expressEnabled ? "info" : "neutral"}
              icon="zap"
              label={status.expressEnabled ? "Express on" : "Express off"}
            />
            {night ? <StatusChip tone="neutral" icon="clock" label={night} /> : null}
          </div>
        ) : null}
      </div>

      {sign ? (
        <div className="flex items-center gap-1 self-start md:self-center" data-testid="shop-sign">
          {/* A hanging sign: the string, then the board. */}
          <div className="flex flex-col items-center">
            <span aria-hidden className="h-3 w-px bg-outline" />
            {canEdit && sign.action !== "hours" ? (
              <button
                type="button"
                disabled={busy}
                onClick={press}
                aria-label={`${sign.word === "OPEN" ? "Open" : "Closed"}. ${sign.line}. ${sign.actionLabel}`}
                className={cn(signClass, "hover:bg-overlay-hover")}
              >
                {signFace}
              </button>
            ) : canEdit || canEditHours ? (
              <Link
                href="/supplier/shop-hours"
                aria-label={`${sign.word === "OPEN" ? "Open" : "Closed"}. ${sign.line}. Change your hours`}
                className={cn(signClass, "no-underline hover:bg-overlay-hover")}
              >
                {signFace}
              </Link>
            ) : (
              <div role="status" className={signClass}>
                {signFace}
              </div>
            )}
          </div>
          {canEditHours ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit hours"
              nativeButton={false}
              render={<Link href="/supplier/shop-hours" />}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close your shop now?</AlertDialogTitle>
            <AlertDialogDescription>
              No new jobs come in until you open it again. Jobs you already have still finish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Stay open</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmClose(false);
                onSave({ temporarilyClosed: true });
              }}
            >
              Close the shop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

