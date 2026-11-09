"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The join link in a read-only field with Copy, and Share where the device has it. */
export function InviteLink({ url, shopName }: { url: string; shopName?: string | null }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          aria-label="Invite link"
          className="min-w-0 flex-1 font-mono text-caption"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          variant="secondary"
          onClick={async () => setCopied(await copyText(url))}
          aria-label={copied ? "Link copied" : "Copy link"}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </Button>
        {canShare ? (
          <Button
            variant="secondary"
            size="icon"
            aria-label="Share link"
            onClick={() =>
              void navigator
                .share({ title: shopName ? `Join ${shopName} on GRIDGO` : "Join on GRIDGO", url })
                .catch(() => undefined)
            }
          >
            <Share2 aria-hidden />
          </Button>
        ) : null}
      </div>
      {copied === false ? (
        <p className="text-caption text-text-muted m-0" role="status">
          Select the link and copy it.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The join link as a QR code. Always dark on a white plate, in both themes,
 * because a phone camera reads dark-on-light.
 */
export function InviteQr({ url }: { url: string }) {
  return (
    <div className="flex justify-center">
      <div
        className="rounded-card border border-outline bg-white p-4 text-black"
        data-testid="invite-qr"
      >
        <QRCodeSVG
          value={url}
          size={208}
          level="M"
          marginSize={0}
          bgColor="transparent"
          fgColor="currentColor"
          role="img"
          aria-label="Invite QR code"
        />
      </div>
    </div>
  );
}
