"use client";

/**
 * One organization account for Operations and Super Admin
 * (gridgoph/gridgo-client#164 and #165): who answers for it now, the dated
 * officer history, the quarterly confirm-the-officer schedule, and a notice
 * Operations can send to the organization at any time.
 *
 * A notice reaches the organization account, which is the shared login the
 * current officer uses. Past officers never receive it. It lands in the app
 * inbox (and as a push where the phone allows), is audited, and cannot be
 * unsent, so the send is confirmed with the recipient restated.
 *
 * Mounted at /ops/organizations/:userId and /admin/organizations/:userId; the
 * list and the statement pages around it belong to the organization money
 * screens.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CalendarClock, FileText, Send } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Detail } from "@/components/approvals/applicant-identity";
import { OfficerHistory } from "@/components/organizations/OfficerHistory";
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
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { getOrganization, isApiError, sendOrganizationNotice } from "@/lib/api/client";
import type { OrganizationAccount } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  confirmationLine,
  noticeProblems,
  organizationStanding,
} from "@/lib/organizations";

type Tree = "ops" | "admin";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Sent = { id: string; title: string; at: string };

export function OrganizationDetail({ tree, userId }: { tree: Tree; userId: string }) {
  const [organization, setOrganization] = useState<OrganizationAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setOrganization(await getOrganization(userId));
      } catch (err) {
        setOrganization(null);
        setError(
          isApiError(err) && err.status === 404
            ? "There is no organization account with this id. It may have been converted back, or the link is wrong."
            : opsErrorMessage(
                err,
                "This organization could not be loaded. Retry when the API responds.",
              ),
        );
      } finally {
        setLoading(false);
      }
    }, [userId]),
  );
  useLiveReload(["identity", "approvals"], load);
  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !organization)
    return <SkeletonDetail label="Loading organization" panels={2} />;
  if (!organization) {
    return (
      <ErrorState
        body={error ?? "Organization not found."}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href={`/${tree}/organizations`} />}
            >
              All organizations
            </Button>
          </div>
        }
      />
    );
  }

  const standing = organizationStanding(organization);
  const name = organization.name || "Organization";

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="gg-card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0 break-words">{name}</h2>
            <p className="text-body text-text-secondary m-0 mt-1">
              {[organization.school, organization.email].filter(Boolean).join(", ") ||
                "No school or login email on record"}
            </p>
          </div>
          <StatusChip tone={standing.tone} label={standing.label} icon={standing.icon} />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-outline-subtle pt-3">
          <Button
            variant="secondary"
            nativeButton={false}
            render={
              <Link
                href={`/${tree}/organizations/${encodeURIComponent(userId)}/statement`}
              />
            }
          >
            <FileText className="size-4" aria-hidden />
            Statement
          </Button>
          {tree === "admin" && organization.approvalCase?.status === "pending" ? (
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/admin/verification" />}
            >
              Review the waiting application
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section
          aria-labelledby="officer-heading"
          className="gg-card flex flex-col gap-3 p-3"
        >
          <h3 id="officer-heading" className="text-h3 text-text-primary m-0">
            Officer of record
          </h3>
          {organization.currentOfficer ? (
            <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail
                label="Current officer"
                value={organization.currentOfficer.fullName}
              />
              {organization.currentOfficer.verifiedAt ? (
                <Detail
                  label="Verified"
                  value={formatDate(organization.currentOfficer.verifiedAt)}
                />
              ) : null}
            </dl>
          ) : null}
          <p className="text-body text-text-secondary m-0 flex items-start gap-2">
            <CalendarClock
              className="mt-0.5 size-4 shrink-0 text-text-muted"
              aria-hidden
            />
            <span>{confirmationLine(organization)}</span>
          </p>
          {organization.approvalCase?.status === "pending" &&
          organization.currentOfficer ? (
            <p className="text-body text-text-secondary m-0">
              A handover is waiting for review. {organization.currentOfficer.fullName}{" "}
              stays the officer, and new orders keep their name, until it is approved.
            </p>
          ) : null}
          <div className="border-t border-outline-subtle pt-3">
            <p className="text-caption text-text-muted m-0 mb-2">History, newest first</p>
            <OfficerHistory
              history={organization.officerHistory}
              current={organization.currentOfficer}
              emptyText="No verified officer yet. This account was created before officers were recorded, or its first application is still waiting. You can still send it a notice."
            />
          </div>
        </section>

        <NoticeComposer organization={organization} />
      </div>
    </div>
  );
}

function NoticeComposer({ organization }: { organization: OrganizationAccount }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);
  const [touched, setTouched] = useState(false);
  // One key per wording: a retry of the same notice can never send it twice,
  // and an edit after a failure is a new notice.
  const key = useRef<{ text: string; value: string } | null>(null);

  const problems = noticeProblems({ title, body });
  const name = organization.name || "this organization";

  function idempotencyKey(): string {
    const text = `${title.trim()}\u0000${body.trim()}`;
    if (!key.current || key.current.text !== text) {
      key.current = { text, value: crypto.randomUUID() };
    }
    return key.current.value;
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const result = await sendOrganizationNotice(
        organization.userId,
        { title: title.trim(), body: body.trim() },
        idempotencyKey(),
      );
      setSent((current) => [
        { id: result.notificationId, title: title.trim(), at: new Date().toISOString() },
        ...current,
      ]);
      setTitle("");
      setBody("");
      setTouched(false);
      key.current = null;
      setConfirming(false);
    } catch (err) {
      setError(noticeErrorMessage(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="notice-heading" className="gg-card flex flex-col gap-3 p-3">
      <div>
        <h3 id="notice-heading" className="text-h3 text-text-primary m-0">
          Send a notice
        </h3>
        <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
          Goes to the organization&apos;s app inbox, on the shared login the current
          officer uses. Past officers do not get it.
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (problems.title || problems.body) return;
          setError(null);
          setConfirming(true);
        }}
      >
        <FieldGroup>
          <Field data-invalid={touched && problems.title ? true : undefined}>
            <FieldLabel htmlFor="notice-title">Title</FieldLabel>
            <Input
              id="notice-title"
              value={title}
              maxLength={NOTICE_TITLE_MAX}
              aria-invalid={touched && problems.title ? true : undefined}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Your officer details need updating"
            />
            <FieldDescription>
              {touched && problems.title
                ? problems.title
                : `${title.trim().length} of ${NOTICE_TITLE_MAX}`}
            </FieldDescription>
          </Field>
          <Field data-invalid={touched && problems.body ? true : undefined}>
            <FieldLabel htmlFor="notice-body">Message</FieldLabel>
            <Textarea
              id="notice-body"
              rows={5}
              value={body}
              maxLength={NOTICE_BODY_MAX}
              aria-invalid={touched && problems.body ? true : undefined}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write it as you would say it to the officer."
            />
            <FieldDescription>
              {touched && problems.body
                ? problems.body
                : `${body.trim().length} of ${NOTICE_BODY_MAX}`}
            </FieldDescription>
          </Field>
        </FieldGroup>

        {title.trim() || body.trim() ? (
          <div
            className="rounded-field border border-outline-subtle bg-surface-variant p-3"
            aria-label="How it reads in the app inbox"
          >
            <p className="text-caption text-text-muted m-0 mb-1 flex items-center gap-1.5">
              <BellRing className="size-3.5" aria-hidden />
              In their inbox
            </p>
            <p className="text-body text-text-primary m-0 break-words" style={medium}>
              {title.trim() || "Title"}
            </p>
            <p className="text-body text-text-secondary m-0 mt-0.5 whitespace-pre-line break-words">
              {body.trim() || "Message"}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            <Send className="size-4" aria-hidden />
            Send notice
          </Button>
        </div>
      </form>

      {sent.length ? (
        <div className="border-t border-outline-subtle pt-3" role="status">
          <p className="text-caption text-text-muted m-0 mb-1">Sent from this page</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {sent.map((item) => (
              <li key={item.id} className="text-body text-text-primary">
                <span style={medium}>{item.title}</span>
                <span className="text-caption text-text-muted">
                  {" "}
                  sent {formatDateTime(item.at)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-text-muted m-0 mt-1">
            Every notice is kept in the audit log.
          </p>
        </div>
      ) : null}

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !busy && setConfirming(open)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Send this notice to {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {organization.currentOfficer
                ? `${organization.currentOfficer.fullName} reads it on the organization's shared login.`
                : "It goes to the organization's login. No officer is verified on this account yet."}{" "}
              It cannot be unsent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-field border border-outline-subtle p-3">
            <p className="text-body text-text-primary m-0 break-words" style={medium}>
              {title.trim()}
            </p>
            <p className="text-body text-text-secondary m-0 mt-0.5 whitespace-pre-line break-words">
              {body.trim()}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={busy}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={busy}
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send notice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function noticeErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case "invalid_notice":
        return `Give the notice a title (up to ${NOTICE_TITLE_MAX} characters) and a message (up to ${NOTICE_BODY_MAX}).`;
      case "idempotency_conflict":
        return "A notice with a different wording was just sent under this attempt. Check the inbox before sending again.";
      case "verified_officer_required":
      case "organization_not_found":
        return "This account is not an organization any more, so it cannot get organization notices.";
    }
  }
  return opsErrorMessage(err, "The notice was not sent. Try again.");
}
