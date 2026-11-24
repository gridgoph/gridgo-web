"use client";

import { Check, Copy, Crown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ownerClaimLink } from "@/lib/api/supplier-signup";
import { ownerClaimMessage } from "@/lib/guided-signup";
import { joinTeamUrl } from "@/lib/shop-team";

/**
 * A manager's last setup step: the owner claims the shop and sets where
 * GRIDGO pays (gridgo-api "Manager starts; owner explicitly claims").
 *
 * A computer has no share sheet, so the message with the link is shown and
 * copied in one press. The link works for 24 hours and only with the owner's
 * mobile; making a new one replaces the old.
 */
export function OwnerClaimCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function make() {
    setError(null);
    setCopied(false);
    setBusy(true);
    const link = await ownerClaimLink();
    setBusy(false);
    if (link.status === "failed") {
      setError(link.message);
      return;
    }
    const text = ownerClaimMessage(joinTeamUrl(window.location.origin, link.token));
    setMessage(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* The message stays on screen to copy by hand. */
    }
  }

  return (
    <section className="gg-card flex flex-col gap-3 p-4" aria-labelledby="owner-claim-heading" data-testid="owner-claim">
      <div className="flex items-start gap-3">
        <Crown aria-hidden className="mt-0.5 size-5 shrink-0 text-text-primary" />
        <div className="flex flex-col gap-1">
          <h3 id="owner-claim-heading" className="text-h3 m-0 text-text-primary">
            Ask your owner to claim the shop
          </h3>
          <p className="text-body m-0 text-text-secondary">
            Send them this link. They sign in with their own mobile and set where GRIDGO pays. Payouts wait
            until they do; jobs do not.
          </p>
        </div>
      </div>
      {message ? (
        <div className="flex flex-col gap-2">
          <p className="text-body m-0 select-all break-words rounded-field bg-surface-variant p-3 text-text-primary" data-testid="owner-claim-message">
            {message}
          </p>
          <p className="text-caption m-0 text-text-muted" role="status">
            {copied ? "Copied. Paste it into a text or chat to your owner." : "Copy it and send it to your owner."}
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="text-body m-0 text-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant="outline" className="self-start" disabled={busy} onClick={() => void make()} data-testid="owner-claim-make">
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {busy ? "Making the link…" : message ? "Make a new link" : "Copy the claim link"}
      </Button>
    </section>
  );
}
