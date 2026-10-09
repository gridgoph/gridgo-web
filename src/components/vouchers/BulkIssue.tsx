"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Copy, FileUp, X } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { issueVoucherCampaign } from "@/lib/api/client";
import type { VoucherCampaign, VoucherIssueReport } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  UNMATCHED_COPY,
  VOUCHER_LIMITS,
  parseRecipients,
  recipientsToSend,
  summarizeIssue,
  validityText,
  voucherErrorIsStale,
  voucherErrorMessage,
} from "@/lib/vouchers";

/**
 * Issue an assigned campaign to a list of client email addresses, pasted or
 * uploaded. The count shown before sending is the count sent: the file is
 * read with the API's own CSV rules.
 *
 * The report afterwards lists the addresses typed in and nothing more, and is
 * kept only on this screen; it is never stored or sent anywhere else.
 */
export function BulkIssue({
  campaign,
  issued,
  onIssued,
  onStale,
}: {
  campaign: VoucherCampaign;
  /** Accounts already holding one, when known. */
  issued: number | null;
  onIssued: () => void;
  onStale: () => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [allAdults, setAllAdults] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<VoucherIssueReport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const adultId = useId();

  const parsed = useMemo(() => parseRecipients(text), [text]);
  const count = parsed.recipients.length;
  const tooMany = count > VOUCHER_LIMITS.recipientsMax;
  const left = issued !== null ? Math.max(0, campaign.totalLimit - issued) : null;
  const adults = parsed.adultColumn
    ? parsed.recipients.filter((row) => row.adultConfirmed).length
    : allAdults
      ? count
      : 0;
  const ready = count > 0 && !tooMany && !parsed.problem && !busy;

  async function readFile(file: File) {
    setFileError(null);
    if (file.size > VOUCHER_LIMITS.csvMaxBytes) {
      setFileError("The file is over 1 MB. Split it and issue in parts.");
      return;
    }
    try {
      setText(await file.text());
      setFileName(file.name);
    } catch {
      setFileError("The file could not be read. Try saving it again as CSV.");
    }
  }

  function clear() {
    setText("");
    setFileName(null);
    setFileError(null);
    setAllAdults(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const result = await issueVoucherCampaign(campaign.id, recipientsToSend(parsed, allAdults));
      setReport(result);
      setConfirming(false);
      clear();
      onIssued();
    } catch (err) {
      setConfirming(false);
      setError(voucherErrorMessage(err, "Nothing was issued. Try again."));
      if (voucherErrorIsStale(err)) onStale();
    } finally {
      setBusy(false);
    }
  }

  if (report) {
    return <IssueReport report={report} onAgain={() => setReport(null)} />;
  }

  return (
    <section aria-labelledby="issue-heading" className="gg-card flex flex-col gap-4">
      <div>
        <h2 id="issue-heading" className="text-h3 text-text-primary m-0">
          Issue to a list
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
          Each address must match one client account. Every person gets{" "}
          {formatPhp(campaign.valueMinor)} once, lasting {validityText(campaign).toLowerCase()}, and
          an in-app notice. Sending the same address again never issues a second one.
        </p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="issue-list">Email addresses</FieldLabel>
          <Textarea
            id="issue-list"
            rows={6}
            value={text}
            disabled={busy || Boolean(fileName)}
            spellCheck={false}
            placeholder={"tester.one@example.com\ntester.two@example.com"}
            onChange={(event) => setText(event.target.value)}
          />
          <FieldDescription>
            One per line, or separated by commas. A column pasted from a spreadsheet works.
          </FieldDescription>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            id="issue-file"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          {fileName ? (
            <span className="border-outline text-body text-text-primary inline-flex min-h-11 items-center gap-1 rounded-full border pr-1 pl-3">
              {fileName}
              <button
                type="button"
                aria-label={`Remove ${fileName}`}
                className="hover:bg-surface-variant inline-flex size-9 items-center justify-center rounded-full"
                disabled={busy}
                onClick={clear}
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
              <FileUp aria-hidden />
              Upload a CSV or text file
            </Button>
          )}
          {text && !fileName ? (
            <Button variant="ghost" disabled={busy} onClick={clear}>
              Clear list
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-text-muted m-0 -mt-3">
          A CSV starts with a row reading email, or email,adultConfirmed with true or false for
          each person. Up to {VOUCHER_LIMITS.recipientsMax.toLocaleString("en-PH")} addresses at a
          time.
        </p>
        {fileError ? (
          <p className="text-body text-error m-0" role="alert">
            {fileError}
          </p>
        ) : null}

        {count || parsed.problem ? (
          <div className="gg-panel flex flex-col gap-1" aria-live="polite">
            {parsed.problem ? (
              <p className="text-body text-error m-0">{parsed.problem}</p>
            ) : (
              <>
                <p className="text-body text-text-primary m-0">
                  <span className="tabular-nums" style={{ fontFamily: "var(--font-bold)" }}>
                    {count.toLocaleString("en-PH")}
                  </span>{" "}
                  {count === 1 ? "address" : "addresses"} ready
                  {parsed.repeats
                    ? `, ${parsed.repeats} ${parsed.repeats === 1 ? "repeat" : "repeats"} counted once`
                    : ""}
                  .
                </p>
                {parsed.ignored.length ? (
                  <p className="text-caption text-text-muted m-0 break-words">
                    Skipped {parsed.ignored.length}{" "}
                    {parsed.ignored.length === 1 ? "entry that is" : "entries that are"} not an
                    address: {parsed.ignored.slice(0, 5).join(", ")}
                    {parsed.ignored.length > 5 ? "…" : ""}
                  </p>
                ) : null}
                {tooMany ? (
                  <p className="text-body text-error m-0">
                    That is more than {VOUCHER_LIMITS.recipientsMax.toLocaleString("en-PH")}. Split
                    the list and issue it in parts.
                  </p>
                ) : null}
                {left !== null && count > left ? (
                  <p className="text-body text-text-primary m-0">
                    Only {left.toLocaleString("en-PH")} of the campaign&rsquo;s{" "}
                    {campaign.totalLimit.toLocaleString("en-PH")} remain. If the new accounts on
                    this list go past that, nothing is issued.
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {parsed.adultColumn ? (
          <p className="text-body text-text-secondary m-0">
            Ages come from the file: {adults} marked adult get a push notification and an email too;
            the other {count - adults} get the in-app notice only.
          </p>
        ) : (
          <Field orientation="horizontal">
            <Checkbox
              id={adultId}
              checked={allAdults}
              disabled={busy}
              onCheckedChange={(value) => setAllAdults(value === true)}
            />
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor={adultId}>Everyone on this list is 18 or older</FieldLabel>
              <FieldDescription>
                Then they also get a push notification and an email. Leave it unticked if anyone
                may be under 18 or you are not sure: they get the in-app notice only.
              </FieldDescription>
            </div>
          </Field>
        )}
      </FieldGroup>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <Button variant="primary" disabled={!ready} onClick={() => setConfirming(true)}>
          {count ? `Issue to ${count.toLocaleString("en-PH")} ${count === 1 ? "address" : "addresses"}` : "Issue vouchers"}
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Issue {formatPhp(campaign.valueMinor)} to {count.toLocaleString("en-PH")}{" "}
              {count === 1 ? "address" : "addresses"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              From &ldquo;{campaign.name}&rdquo;. Each matching client gets the voucher at once
              with an in-app notice
              {adults
                ? `; ${adults === count ? "all of them" : `${adults} of them`} also get a push notification and an email`
                : ", and no push or email"}
              . A notice cannot be taken back; you can void a voucher afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void issue()}>
              {busy ? "Issuing…" : "Issue vouchers"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function IssueReport({
  report,
  onAgain,
}: {
  report: VoucherIssueReport;
  onAgain: () => void;
}) {
  const summary = summarizeIssue(report);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(key: string, emails: string[]) {
    try {
      await navigator.clipboard.writeText(emails.join("\n"));
      setCopied(key);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section aria-labelledby="report-heading" className="gg-card flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="report-heading" className="text-h3 text-text-primary m-0">
            Issue report
          </h2>
          <p className="text-caption text-text-muted m-0 mt-1 max-w-prose">
            This report is not saved. Copy any addresses you need before leaving this page, and keep
            them out of public issues and chats.
          </p>
        </div>
        <Button variant="outline" onClick={onAgain}>
          Issue another list
        </Button>
      </div>

      <dl className="m-0 grid gap-3 sm:grid-cols-3" aria-live="polite">
        <Figure label="Issued now" value={summary.issued} />
        <Figure label="Already had one" value={summary.alreadyHad} hint="Nothing new sent" />
        <Figure label="Not issued" value={summary.unmatched} />
      </dl>

      {(Object.keys(summary.byReason) as (keyof typeof summary.byReason)[])
        .filter((reason) => summary.byReason[reason].length)
        .map((reason) => (
          <div key={reason} className="border-outline flex flex-col gap-2 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusChip
                tone={reason === "no_client_account" ? "warning" : "error"}
                icon={reason === "no_client_account" ? "circle-help" : "triangle-alert"}
                label={`${UNMATCHED_COPY[reason].title}: ${summary.byReason[reason].length}`}
              />
              <Button variant="ghost" onClick={() => void copy(reason, summary.byReason[reason])}>
                <Copy aria-hidden />
                {copied === reason ? "Copied" : "Copy addresses"}
              </Button>
            </div>
            <p className="text-body text-text-secondary m-0 max-w-prose">{UNMATCHED_COPY[reason].body}</p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {summary.byReason[reason].map((email, index) => (
                <li key={`${email}-${index}`} className="text-body text-text-primary break-all">
                  {email || "(blank)"}
                </li>
              ))}
            </ul>
          </div>
        ))}

      {report.matched.length ? (
        <Collapsible className="border-outline border-t pt-3">
          <CollapsibleTrigger
            render={<Button variant="ghost" className="px-0" />}
          >
            Show the {report.matched.length} matched {report.matched.length === 1 ? "address" : "addresses"}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {report.matched.map((row) => (
                <li key={row.voucherId} className="flex flex-wrap items-center justify-between gap-x-3">
                  <span className="text-body text-text-primary break-all">{row.email}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-caption text-text-muted">
                      {row.issued ? "Issued now" : "Already had one"}
                    </span>
                    <Link
                      href={`/admin/vouchers?tab=lookup&client=${encodeURIComponent(row.clientId)}`}
                      className="text-body text-text-primary inline-flex min-h-11 items-center underline-offset-2 hover:underline"
                    >
                      Open wallet
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="gg-panel flex flex-col">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-h2 text-text-primary m-0 tabular-nums">{value.toLocaleString("en-PH")}</dd>
      {hint ? <span className="text-caption text-text-muted">{hint}</span> : null}
    </div>
  );
}
