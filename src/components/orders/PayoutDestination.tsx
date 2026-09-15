"use client";

/**
 * Where a shop's money goes, drawn as the plate Operations scans.
 *
 * A release is a person opening a wallet app and pointing a phone at the
 * shop's receiving QR, the same laminated plate that sits on the shop's
 * counter. So the plate is drawn as a plate: square, always on white even in
 * the dark theme (a wallet camera reads dark-on-light, and nothing else about
 * the portal's theme matters to it), and big enough to scan from the screen
 * without leaning in. The words beside it are what the person checks after
 * the scan: the wallet app names the account it found, and that name should
 * match the one here.
 */

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFileDownloadUrl } from "@/lib/api/client";
import type { SupplierPayoutAccount } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export const PAYOUT_PROVIDER_LABELS: Record<string, string> = {
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank transfer",
  other: "Wallet",
};

export function payoutProviderLabel(
  account: Pick<SupplierPayoutAccount, "provider" | "institution">,
): string {
  const base = PAYOUT_PROVIDER_LABELS[account.provider] ?? account.provider;
  if (
    (account.provider === "bank" || account.provider === "other") &&
    account.institution
  ) {
    return account.provider === "bank"
      ? `${account.institution} bank transfer`
      : account.institution;
  }
  return base;
}

/** One line for the audit trail and the release confirmation: "GCash · Ben S. · +63…". */
export function describePayoutDestination(account: SupplierPayoutAccount): string {
  return [payoutProviderLabel(account), account.accountName, account.accountNumber]
    .filter(Boolean)
    .join(" · ");
}

type PlateProps = {
  fileId: string | null | undefined;
  /** The shop, for the picture's accessible name. */
  shopName?: string | null;
  /** Width class for the plate; it is always square. */
  className?: string;
  /** Whether a click opens the scan-sized view. */
  enlarge?: boolean;
};

export function PayoutQrPlate({
  fileId,
  shopName,
  className,
  enlarge = true,
}: PlateProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!fileId) return;
    let cancelled = false;
    getFileDownloadUrl(fileId)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const alt = shopName ? `${shopName}'s payout QR` : "Payout QR";
  const frame = cn(
    "flex aspect-square w-full items-center justify-center overflow-hidden rounded-card border border-outline bg-white",
    className,
  );

  if (!fileId) {
    return (
      <div className={frame} role="img" aria-label="No payout QR on file">
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <QrCode size={32} strokeWidth={1.5} className="text-text-muted" aria-hidden />
          <span className="text-caption text-text-muted">No QR on file</span>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={frame} role="img" aria-label={`${alt} could not be loaded`}>
        <span className="p-4 text-center text-caption text-text-muted">
          Could not load the QR. Retry the page.
        </span>
      </div>
    );
  }

  if (!url) {
    return <div className={cn(frame, "animate-pulse bg-surface-variant")} aria-hidden />;
  }

  const picture = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="h-full w-full object-contain" />
  );

  if (!enlarge) return <div className={frame}>{picture}</div>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          frame,
          "cursor-zoom-in text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-yellow",
        )}
        aria-label={`Open ${alt} at scan size`}
      >
        {picture}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-[min(640px,calc(100%-2rem))] max-w-none bg-white p-4 text-black sm:max-w-none"
          showCloseButton
        >
          <DialogTitle className="text-black">{alt}</DialogTitle>
          <DialogDescription className="text-black/70">
            Hold your phone up to the screen. The wallet app should name the account
            below.
          </DialogDescription>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            className="mx-auto mt-2 max-h-[70vh] w-full max-w-[560px] object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type CardProps = {
  account: SupplierPayoutAccount | null | undefined;
  /** Fallback when the account carries no shop name. */
  shopName?: string | null;
};

/**
 * The words that go with the plate. Rendered as a definition list so a
 * screen reader hears "Paid through, GCash" rather than a bare "GCash".
 */
export function PayoutDestinationWords({ account, shopName }: CardProps) {
  if (!account) return null;
  const name = account.shopName ?? shopName ?? null;
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      {name ? (
        <>
          <dt className="text-caption text-text-muted">Shop</dt>
          <dd
            className="m-0 text-body text-text-primary"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {name}
          </dd>
        </>
      ) : null}
      <dt className="text-caption text-text-muted">Paid through</dt>
      <dd className="m-0 text-body text-text-primary">{payoutProviderLabel(account)}</dd>
      <dt className="text-caption text-text-muted">Account name</dt>
      <dd className="m-0 text-body text-text-primary">{account.accountName}</dd>
      {account.accountNumber ? (
        <>
          <dt className="text-caption text-text-muted">Number</dt>
          <dd className="m-0 text-body text-text-secondary tabular-nums">
            {account.accountNumber}
          </dd>
        </>
      ) : null}
    </dl>
  );
}

export const NO_PAYOUT_ACCOUNT =
  "This shop has not said where it wants to be paid. Ask them to add it in the supplier app under Account, then Where you get paid.";

/**
 * The card on the payout desk. Plate first, words under it, and an honest
 * sentence when the shop has never set one up.
 */
export function PayoutDestinationCard({ account, shopName }: CardProps) {
  return (
    <section className="gg-card p-3" aria-labelledby="payout-destination-heading">
      <h2
        id="payout-destination-heading"
        className="text-overline text-text-muted m-0 mb-2"
      >
        Where this money goes
      </h2>
      {account ? (
        <div className="flex flex-col gap-3">
          <PayoutQrPlate
            fileId={account.qr?.fileId}
            shopName={account.shopName ?? shopName}
          />
          <PayoutDestinationWords account={account} shopName={shopName} />
          {!account.qr ? (
            <p className="text-caption text-text-muted m-0">
              No QR yet. Send to the name and number above by hand.
            </p>
          ) : (
            <p className="text-caption text-text-muted m-0">
              Click the plate to scan it from the screen. The wallet should name{" "}
              <span className="text-text-primary">{account.accountName}</span> before you
              send.
            </p>
          )}
        </div>
      ) : (
        <p className="text-body text-text-secondary m-0" role="status">
          {NO_PAYOUT_ACCOUNT}
        </p>
      )}
    </section>
  );
}
