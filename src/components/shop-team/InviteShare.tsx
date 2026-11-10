"use client";

import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messengerShareTarget } from "@/lib/shop-team";

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type LinkNote = "copy-failed" | "messenger-paste" | "messenger-opened" | null;

const LINK_NOTE: Record<Exclude<LinkNote, null>, string> = {
  "copy-failed": "Select the link and copy it.",
  "messenger-paste": "Link copied. Paste it into a Messenger chat.",
  "messenger-opened": "Link copied too, in case Messenger doesn't open.",
};

/**
 * The join link in a read-only field, then Copy, Messenger, and Share where
 * the device has it. Messenger always copies the link first, so the Owner
 * has it even when Messenger cannot take it.
 */
export function InviteLink({ url, shopName }: { url: string; shopName?: string | null }) {
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<LinkNote>(null);
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  // A new code is a new link: earlier feedback was about the old one.
  useEffect(() => {
    setCopied(false);
    setNote(null);
  }, [url]);

  async function copy() {
    const ok = await copyText(url);
    setCopied(ok);
    setNote(ok ? null : "copy-failed");
  }

  async function messenger() {
    const target = messengerShareTarget(url, navigator.userAgent);
    // Hand off in the same tap, before awaiting the copy: browsers block a
    // pop-up or app link that no longer counts as the person's own action.
    const copying = copyText(url);
    if (target.prefilled) window.location.href = target.href;
    else window.open(target.href, "_blank", "noopener,noreferrer");
    const ok = await copying;
    setCopied(ok);
    if (target.prefilled) setNote(ok ? "messenger-opened" : null);
    else setNote(ok ? "messenger-paste" : "copy-failed");
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        readOnly
        value={url}
        aria-label="Invite link"
        className="min-w-0 font-mono text-caption"
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => void copy()}
          aria-label={copied ? "Link copied" : "Copy link"}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span>{copied ? "Copied" : "Copy link"}</span>
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          aria-label="Share via Messenger"
          onClick={() => void messenger()}
        >
          <MessageCircle aria-hidden />
          <span>Messenger</span>
        </Button>
        {canShare ? (
          <Button
            variant="secondary"
            size="icon"
            aria-label="Share link"
            onClick={() =>
              void navigator
                .share({
                  title: shopName ? `Join ${shopName} on GRIDGO` : "Join on GRIDGO",
                  url,
                })
                .catch(() => undefined)
            }
          >
            <Share2 aria-hidden />
          </Button>
        ) : null}
      </div>
      {note ? (
        <p className="text-caption text-text-muted m-0" role="status">
          {LINK_NOTE[note]}
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
