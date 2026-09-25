"use client";

import { ExternalLink } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { OPERATIONS_CONTACT_URL, type WithdrawnStatus } from "@/lib/auth/account-standing";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

type StandingCopy = {
  chip: { label: string; tone: StatusTone; icon: StatusIconName };
  title: string;
  body: string;
  noReason: string;
  nextStep: string;
  recheckLead: string;
};

/** One entry per standing. A new standing (an account removal, say) is one more entry. */
const STANDING_COPY: Record<WithdrawnStatus, StandingCopy> = {
  suspended: {
    chip: { label: "Suspended", tone: "warning", icon: "triangle-alert" },
    title: "Your shop is suspended on GRIDGO",
    body: "GRIDGO Operations has paused this shop. While the suspension stands, the shop receives no new jobs and this workspace stays closed. Your account has not been deleted.",
    noReason:
      "No reason was recorded with this suspension. Operations can tell you why and what would lift it.",
    nextStep:
      "Contact Operations through the GRIDGO report page. Include your shop name so they can find your account.",
    recheckLead: "Has Operations lifted the suspension?",
  },
  rejected: {
    chip: { label: "Not approved", tone: "neutral", icon: "circle-x" },
    title: "Your shop application was not approved",
    body: "GRIDGO Operations reviewed this shop and did not approve it. This workspace opens once an application is approved.",
    noReason:
      "No reason was recorded with this decision. Operations can tell you what to change.",
    nextStep:
      "Correct your application and apply again in the GRIDGO Supplier app. To ask about the decision, contact Operations through the GRIDGO report page.",
    recheckLead: "Applied again from the app?",
  },
};

type Props = {
  status: WithdrawnStatus;
  /** Operations' own words. Null shows an honest "no reason was recorded". */
  reason: string | null;
  accountName?: string | null;
  email?: string | null;
  onSignOut: () => void;
  /** Re-reads the account once, on request. The notice itself never polls. */
  onCheckAgain?: () => void;
};

/**
 * Full-page notice for an account whose workspace GRIDGO has closed. It makes
 * no API calls of its own: whoever mounts it must also stop mounting the
 * workspace, so nothing keeps asking for data the account may no longer read.
 */
export function AccountStandingNotice({
  status,
  reason,
  accountName,
  email,
  onSignOut,
  onCheckAgain,
}: Props) {
  const copy = STANDING_COPY[status];
  const signedInAs = [accountName, email ? `signed in as ${email}` : null]
    .filter(Boolean)
    .join(", ");

  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-canvas p-4"
    >
      <article
        aria-labelledby="account-standing-title"
        className="flex w-full max-w-xl flex-col rounded-card border border-outline bg-surface p-6 shadow-card md:p-8"
      >
        <div className="self-start">
          <StatusChip tone={copy.chip.tone} label={copy.chip.label} icon={copy.chip.icon} />
        </div>

        <h1 id="account-standing-title" className="text-h1 text-text-primary m-0 mt-5">
          {copy.title}
        </h1>
        {signedInAs ? (
          <p className="text-caption text-text-muted m-0 mt-2">
            {signedInAs.charAt(0).toUpperCase() + signedInAs.slice(1)}
          </p>
        ) : null}

        <p className="text-body-lg text-text-secondary m-0 mt-5 max-w-prose">{copy.body}</p>

        <div className="mt-6 border-l-2 border-text-primary py-1 pl-4">
          <p className="text-caption text-text-muted m-0">Reason from Operations</p>
          {reason ? (
            <p
              className="text-body-lg text-text-primary m-0 mt-1 break-words"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {reason}
            </p>
          ) : (
            <p className="text-body text-text-secondary m-0 mt-1">{copy.noReason}</p>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-outline pt-6">
          <p className="text-body text-text-secondary m-0 max-w-prose">{copy.nextStep}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={OPERATIONS_CONTACT_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "primary" })}
            >
              Contact Operations
              <ExternalLink aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <Button onClick={onSignOut}>Sign out</Button>
          </div>
          {onCheckAgain ? (
            <p className="text-body text-text-muted m-0 flex flex-wrap items-center gap-x-1">
              {copy.recheckLead}
              <Button
                variant="ghost"
                className="-ml-2 px-2 underline underline-offset-4"
                onClick={onCheckAgain}
              >
                Check again
              </Button>
            </p>
          ) : null}
        </div>
      </article>
    </main>
  );
}
