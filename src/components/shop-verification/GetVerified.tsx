"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpToLine,
  BadgeCheck,
  CalendarCheck,
  FileText,
  IdCard,
  ScanFace,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { attachVerificationDocument, uploadVerificationDocument } from "@/lib/api/client";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  VERIFICATION_PAPERS,
  daysLeftWord,
  missingPapers,
  papersOnFile,
  verificationBenefits,
  type ShopVerificationRead,
  type VerificationPaper,
} from "@/lib/shop-verification";
import { uploadErrorMessage } from "@/lib/upload-errors";
import { useSupplierDesktop } from "@/lib/useSupplierDesktop";

const PAPER_ICON: Record<VerificationPaper, LucideIcon> = {
  valid_id: IdCard,
  id_selfie: ScanFace,
  business_permit: FileText,
};

const BENEFIT_ICON: LucideIcon[] = [BadgeCheck, ArrowUpToLine, Wallet, CalendarCheck];

type Sending = { paper: VerificationPaper; status: "sending" } | null;

/**
 * Get verified (gridgo-api#411): the shop's optional step, the same papers and
 * words as the phone app's `app/verify.tsx`. Each paper uploads as soon as it
 * is picked and then reads Checking; jobs carry on either way. The papers go
 * through the private file intake only and are never kept by this page.
 */
export function GetVerified({
  read,
  onChanged,
}: {
  read: ShopVerificationRead;
  onChanged: () => Promise<void> | void;
}) {
  const desktop = useSupplierDesktop();
  const v = read.verification;
  const onFile = papersOnFile(read.files);
  const missing = missingPapers(read.files);
  const [sending, setSending] = useState<Sending>(null);
  const [errors, setErrors] = useState<Partial<Record<VerificationPaper, string>>>({});
  const inputs = useRef<Partial<Record<VerificationPaper, HTMLInputElement | null>>>({});

  async function send(paper: VerificationPaper, file: File | undefined) {
    if (!file || sending) return;
    setSending({ paper, status: "sending" });
    setErrors((current) => ({ ...current, [paper]: undefined }));
    try {
      const uploaded = await uploadVerificationDocument(file);
      await attachVerificationDocument(uploaded.fileId, paper);
      await onChanged();
    } catch (err) {
      setErrors((current) => ({
        ...current,
        [paper]: uploadErrorMessage(err, {
          what: "this photo",
          notSent: "was not sent to GRIDGO",
        }),
      }));
    } finally {
      setSending(null);
    }
  }

  if (v.verified) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-4" data-testid="get-verified">
        <header className="flex flex-col gap-2">
          <h2 className="text-h1 text-text-primary m-0">Your shop is verified</h2>
          <div className="flex">
            <StatusChip tone="success" icon="circle-check" label="Verified" />
          </div>
          <p className="text-body text-text-secondary m-0 max-w-prose">
            Clients see the Verified badge next to your shop name. Your payouts have no
            limit and new orders keep coming.
          </p>
        </header>
      </div>
    );
  }

  const allSent = missing.length === 0;
  const title = allSent
    ? "GRIDGO is checking your papers"
    : "Verified shops get more jobs";

  const intro = (
    <header className="flex flex-col gap-2">
      <p className="text-body text-text-muted m-0">Get verified · optional now</p>
      <h2 className="text-h1 text-text-primary m-0">{title}</h2>
      <p className="text-body text-text-secondary m-0 max-w-prose">
        {allSent
          ? "You can take jobs while we check. We'll tell you when you're verified."
          : "Send your ID, a selfie with it, and your business permit. A photo is fine. You can keep taking jobs while GRIDGO checks."}
      </p>
    </header>
  );

  const papers = (
    <section aria-labelledby="papers-heading" className="gg-card flex flex-col p-4">
      <h3 id="papers-heading" className="text-h3 text-text-primary m-0 pb-2">
        Your papers
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {VERIFICATION_PAPERS.map((definition) => {
          const file = onFile[definition.paper];
          const Icon = PAPER_ICON[definition.paper];
          const busy = sending?.paper === definition.paper;
          const error = errors[definition.paper];
          return (
            <li
              key={definition.paper}
              className="border-outline-subtle flex flex-col gap-2 border-t py-3 first:border-t-0"
              data-testid={`paper-${definition.paper}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="bg-surface-variant text-text-primary flex size-11 shrink-0 items-center justify-center rounded-field"
                  aria-hidden
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-[9rem] flex-1 basis-0 flex-col">
                  <span
                    className="text-body text-text-primary"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {definition.title}
                  </span>
                  <span className="text-caption text-text-muted">
                    {file
                      ? file.sentAt
                        ? `Sent ${formatDateTime(file.sentAt)}`
                        : "Sent"
                      : definition.detail}
                  </span>
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {file && !busy ? (
                    <StatusChip tone="info" icon="clock" label="Checking" />
                  ) : null}
                  <input
                    ref={(node) => {
                      inputs.current[definition.paper] = node;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label={`${definition.title} file`}
                    onChange={(event) => {
                      const picked = event.target.files?.[0];
                      event.target.value = "";
                      void send(definition.paper, picked);
                    }}
                  />
                  <Button
                    variant={file ? "ghost" : "outline"}
                    disabled={Boolean(sending)}
                    onClick={() => inputs.current[definition.paper]?.click()}
                    aria-label={`${file ? "Send a new" : "Upload"} ${definition.title.toLowerCase()}`}
                  >
                    {busy ? "Sending…" : file ? "Send a new one" : "Upload"}
                  </Button>
                </span>
              </div>
              {error ? (
                <p className="text-body text-error m-0" role="alert">
                  {error}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );

  const benefits = (
    <section aria-labelledby="benefits-heading" className="flex flex-col gap-2">
      <h3 id="benefits-heading" className="text-h3 text-text-primary m-0">
        What you get
      </h3>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
        {verificationBenefits(v).map((benefit, index) => {
          const Icon = BENEFIT_ICON[index] ?? BadgeCheck;
          return (
            <li key={benefit.title} className="gg-card flex items-start gap-3 p-3">
              <Icon
                className="mt-0.5 size-5 shrink-0"
                style={{ color: "var(--color-success)" }}
                aria-hidden
              />
              <span className="flex min-w-0 flex-col">
                <span
                  className="text-body text-text-primary"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {benefit.title}
                </span>
                <span className="text-caption text-text-muted">{benefit.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const timeLine =
    v.newOrdersPaused && v.recoveryDueMinor === 0
      ? "Your time to get verified has ended. New orders start again once you're verified. Your open jobs still finish."
      : v.countdownDays != null
        ? `${daysLeftWord(v.countdownDays)} to get verified. New orders pause when your time is up. Your open jobs still finish.`
        : "No time now? You can take jobs today and send these later.";

  const status = (
    <section
      aria-label="Your time and payouts"
      className="gg-card flex flex-col gap-2 p-4"
    >
      <p className="text-body text-text-primary m-0">{timeLine}</p>
      {v.payoutCapMinor > 0 ? (
        <p className="text-body text-text-secondary m-0">
          {formatPhp(v.paidBeforeVerificationMinor)} of {formatPhp(v.payoutCapMinor)} paid
          out so far.
          {v.heldMinor > 0
            ? ` ${formatPhp(v.heldMinor)} is waiting and is paid once you're verified.`
            : ""}
        </p>
      ) : null}
      {v.recoveryDueMinor > 0 ? (
        <p className="text-body text-text-secondary m-0">
          {formatPhp(v.recoveryDueMinor)} from a dropped job will come out of your next
          payouts.
        </p>
      ) : null}
      <Link
        href="/supplier/dashboard"
        className="text-body text-text-primary flex min-h-11 items-center underline"
      >
        {allSent ? "Back to To do" : "Not now, back to To do"}
      </Link>
    </section>
  );

  if (!desktop) {
    return (
      <div
        className="flex w-full flex-col gap-4"
        data-testid="get-verified"
        data-layout="phone"
      >
        {intro}
        {allSent ? null : benefits}
        {papers}
        {status}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="get-verified" data-layout="desktop">
      {intro}
      <div className="grid grid-cols-[minmax(0,1fr)_22.5rem] items-start gap-4">
        <div className="flex min-w-0 flex-col gap-4">
          {papers}
          {allSent ? null : benefits}
        </div>
        <aside className="sticky top-[4.25rem] flex flex-col gap-4">{status}</aside>
      </div>
    </div>
  );
}
