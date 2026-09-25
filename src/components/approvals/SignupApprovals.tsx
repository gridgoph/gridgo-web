"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

/**
 * Supplier, rider, and business-client sign-up approvals.
 *
 * Suppliers and riders cannot work until someone says yes. A personal client
 * who asks to become a business or organization stays personal until this
 * queue converts them. Operations mounts it at /ops/approvals and Super Admin
 * inside /admin/verification.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  presentVerification,
  verificationActions,
  type VerificationAction,
} from "@/app/admin/_lib/present";
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
import {
  ApplicantHeader,
  Detail,
  SupplierCategoryRanks,
} from "@/components/approvals/applicant-identity";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SkeletonCards } from "@/components/ui/loading";
import { Textarea } from "@/components/ui/textarea";
import {
  decideApprovalCase,
  getApprovalCase,
  listApprovalCases,
  listUsers,
  setUserVerification,
} from "@/lib/api/client";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { isAwaitingSignupReview } from "@/components/approvals/signup-queue";
import type {
  ApprovalCaseDetail,
  ApprovalCaseSummary,
  ApprovalDecisionAction,
  Taxonomy,
  User,
} from "@/lib/api/types";
import { getTaxonomy } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";

type Props = {
  /** Extra prose above the queue, when the mounting surface needs it. */
  intro?: string;
};

type Loaded = {
  people: User[];
  business: ApprovalCaseDetail[];
  categoryNames: Record<string, string>;
};

type ConfirmTarget =
  | { kind: "member"; user: User; action: VerificationAction }
  | { kind: "business"; detail: ApprovalCaseDetail; action: VerificationAction };

const BUSINESS_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;

const ORDER: Record<string, number> = {
  pending: 0,
  unverified: 1,
  suspended: 2,
  approved: 3,
  rejected: 4,
};

export function SignupApprovals({ intro }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const [reason, setReason] = useState("");

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [suppliers, riders, taxonomy, ...businessPages] = await Promise.all([
          listUsers("supplier"),
          listUsers("rider"),
          getTaxonomy().catch(() => null as Taxonomy | null),
          ...BUSINESS_STATUSES.map((status) =>
            listApprovalCases({ kind: "business_client", status }),
          ),
        ]);
        const categoryNames: Record<string, string> = {};
        for (const category of taxonomy?.categories ?? []) {
          categoryNames[category.code] = category.name;
        }
        const summaries = businessPages.flatMap((page) => page.approvalCases);
        const business = await Promise.all(
          summaries.map((item) => getApprovalCase(item.id)),
        );
        setData({ people: [...suppliers, ...riders], business, categoryNames });
      } catch (err) {
        setData(null);
        setError(
          opsErrorMessage(
            err,
            "Could not load sign-ups. Confirm the demo API is running, then retry.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload("approvals", load);

  useEffect(() => {
    void load();
  }, [load]);

  const { waiting, decided, waitingBusiness, decidedBusiness } = useMemo(() => {
    const people = [...(data?.people ?? [])].sort((a, b) => {
      const rank =
        (ORDER[a.verificationStatus ?? "unverified"] ?? 9) -
        (ORDER[b.verificationStatus ?? "unverified"] ?? 9);
      if (rank !== 0) return rank;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
    const business = [...(data?.business ?? [])].sort((left, right) =>
      (left.approvalCase.submittedAt ?? left.approvalCase.updatedAt).localeCompare(
        right.approvalCase.submittedAt ?? right.approvalCase.updatedAt,
      ),
    );
    return {
      waiting: people.filter(isAwaitingSignupReview),
      decided: people.filter(
        (u) =>
          u.verificationStatus === "approved" ||
          u.verificationStatus === "suspended" ||
          u.verificationStatus === "rejected",
      ),
      waitingBusiness: business.filter((item) => item.approvalCase.status === "pending"),
      decidedBusiness: business.filter((item) => item.approvalCase.status !== "pending"),
    };
  }, [data]);

  async function apply() {
    if (!confirm) return;
    if (confirm.action.status === "rejected" && !reason.trim()) {
      setActionError("Give a reason. It is the only explanation this person receives.");
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      if (confirm.kind === "business") {
        const decision = caseDecision(confirm.action.status, confirm.detail.approvalCase.status);
        if (!decision) {
          setActionError("That decision is not available for this application.");
          setBusy(false);
          return;
        }
        if (decision === "restore" && !reason.trim()) {
          setActionError("Add a note for the record before restoring this account.");
          setBusy(false);
          return;
        }
        const note = reason.trim();
        await decideApprovalCase(confirm.detail.approvalCase.id, decision, {
          expectedVersion: confirm.detail.approvalCase.version,
          requestId: crypto.randomUUID(),
          ...(decision === "approve" ? { note: note || undefined } : {}),
          ...(decision === "restore" ? { note } : {}),
          ...(decision === "reject" || decision === "suspend" ? { reason: note } : {}),
        });
        const name =
          confirm.detail.application?.businessName ||
          confirm.detail.clientProfile?.businessName ||
          confirm.detail.applicant?.name ||
          "This application";
        setActionOk(
          decision === "approve"
            ? `${name} is now a ${confirm.detail.application?.accountType === "organization" ? "organization" : "business"} client.`
            : `${name}: ${confirm.action.label.toLowerCase()} applied.`,
        );
      } else {
        await setUserVerification(confirm.user.id, {
          status: confirm.action.status,
          reason: reason.trim() || undefined,
          note: reason.trim() || undefined,
        });
        setActionOk(
          confirm.action.status === "approved"
            ? `${confirm.user.name} can start taking work.`
            : `${confirm.user.name}: ${confirm.action.label.toLowerCase()} applied.`,
        );
      }
      setConfirm(null);
      setReason("");
      await load();
    } catch (err) {
      setActionError(opsErrorMessage(err, "Could not save that decision. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const pending = loading && !data;

  if (!pending && (error || !data)) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {intro ??
            "Suppliers and riders wait here before they can take work. Personal clients who apply for a business or organization account also wait here — they keep ordering as themselves until someone converts the account."}
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}
      {actionError && !confirm ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
        <h2 id="waiting-heading" className="text-h3 text-text-primary m-0">
          Waiting for a decision{data ? ` (${waiting.length + waitingBusiness.length})` : ""}
        </h2>
        {pending ? (
          <SkeletonCards count={2} lines={2} label="Loading sign-ups" />
        ) : !waiting.length && !waitingBusiness.length ? (
          <EmptyState
            title="Nobody is waiting"
            body="Every supplier, rider, and business application has had a decision. New sign-ups and client conversions land here the moment they are submitted."
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Check again
              </Button>
            }
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {waitingBusiness.map((detail) => (
              <BusinessApplicationCard
                key={detail.approvalCase.id}
                detail={detail}
                onAction={(action) => {
                  setActionError(null);
                  setReason("");
                  setConfirm({ kind: "business", detail, action });
                }}
              />
            ))}
            {waiting.map((person) => (
              <ApplicantCard
                key={person.id}
                person={person}
                categoryNames={data?.categoryNames ?? {}}
                onAction={(action) => {
                  setActionError(null);
                  setReason("");
                  setConfirm({ kind: "member", user: person, action });
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {decided.length || decidedBusiness.length ? (
        <section aria-labelledby="decided-heading" className="flex flex-col gap-3">
          <h2 id="decided-heading" className="text-h3 text-text-primary m-0">
            Already decided ({decided.length + decidedBusiness.length})
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {decidedBusiness.map((detail) => (
              <BusinessApplicationCard
                key={detail.approvalCase.id}
                detail={detail}
                onAction={(action) => {
                  setActionError(null);
                  setReason("");
                  setConfirm({ kind: "business", detail, action });
                }}
              />
            ))}
            {decided.map((person) => (
              <ApplicantCard
                key={person.id}
                person={person}
                categoryNames={data?.categoryNames ?? {}}
                onAction={(action) => {
                  setActionError(null);
                  setReason("");
                  setConfirm({ kind: "member", user: person, action });
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setReason("");
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action.label} {confirmName(confirm)}?
            </AlertDialogTitle>
            <AlertDialogDescription>{confirm?.action.consequence}</AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="approval-reason">
                {confirm?.action.status === "rejected"
                  ? "Reason (required)"
                  : "Note for the record (optional)"}
              </FieldLabel>
              <Textarea
                id="approval-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  confirm?.action.status === "rejected"
                    ? "e.g. Shop address could not be verified on site"
                    : "e.g. Pilot accreditation complete"
                }
              />
              <FieldDescription>
                Stored against the account with your name and the time.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConfirm(null);
                setReason("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.action.danger ? "danger" : "primary"}
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? "Saving…" : confirm?.action.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ApplicantCard({
  person,
  categoryNames,
  onAction,
}: {
  person: User;
  categoryNames: Record<string, string>;
  onAction: (action: VerificationAction) => void;
}) {
  const status = presentVerification(person.verificationStatus);
  const actions = verificationActions(person.verificationStatus);

  return (
    <li className="gg-card flex flex-col gap-3">
      <ApplicantHeader
        title={person.supplierName || person.name}
        caption={[
          person.role === "supplier" ? "Supplier" : "Rider",
          person.supplierName ? person.name : null,
          person.email,
        ]
          .filter(Boolean)
          .join(" · ")}
        status={status}
      />

      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {person.phone ? <Detail label="Phone" value={person.phone} /> : null}
        {person.shop?.label ? <Detail label="Shop" value={person.shop.label} /> : null}
        {person.riderProfile?.vehicleType ? (
          <Detail
            label="Vehicle"
            value={[person.riderProfile.vehicleType, person.riderProfile.plateNumber]
              .filter(Boolean)
              .join(" · ")}
          />
        ) : null}
        {person.riderProfile?.licenseNumber ? (
          <Detail label="Licence" value={person.riderProfile.licenseNumber} />
        ) : null}
        {person.createdAt ? (
          <Detail label="Signed up" value={formatDateTime(person.createdAt)} />
        ) : null}
        {person.verifiedAt ? (
          <Detail label="Last decision" value={formatDateTime(person.verifiedAt)} />
        ) : null}
      </dl>

      {person.role === "supplier" ? (
        <SupplierCategoryRanks
          ranks={person.categoryRanks}
          categoryNames={categoryNames}
          empty={
            <p className="text-body text-text-secondary m-0 mt-1">
              They ranked no categories at sign-up, so matching has nothing to go on. Ask
              them to complete their profile before approving.
            </p>
          }
        />
      ) : null}

      {person.verificationNote ? (
        <p className="text-caption text-text-secondary m-0">
          Last note: {person.verificationNote}
        </p>
      ) : null}

      {actions.length ? (
        <div className="flex flex-wrap gap-2 border-t border-outline-subtle pt-3">
          {actions.map((action) => (
            <Button
              key={action.status}
              variant={action.danger ? "danger" : "secondary"}
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function BusinessApplicationCard({
  detail,
  onAction,
}: {
  detail: ApprovalCaseDetail;
  onAction: (action: VerificationAction) => void;
}) {
  const status = presentVerification(detail.approvalCase.status);
  const actions = businessApplicationActions(detail.approvalCase.status);
  const requested =
    detail.application?.accountType === "organization" ? "Organization" : "Business";
  const title =
    detail.application?.businessName ||
    detail.clientProfile?.businessName ||
    detail.applicant?.name ||
    "Business application";

  return (
    <li className="gg-card flex flex-col gap-3">
      <ApplicantHeader
        title={title}
        caption={[requested + " client", detail.applicant?.name, detail.applicant?.email]
          .filter(Boolean)
          .join(" · ")}
        status={status}
      />

      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {detail.application?.businessNature || detail.clientProfile?.businessNature ? (
          <Detail
            label="What they do"
            value={
              detail.application?.businessNature ||
              detail.clientProfile?.businessNature ||
              ""
            }
          />
        ) : null}
        {detail.applicant?.phone ? <Detail label="Phone" value={detail.applicant.phone} /> : null}
        {detail.approvalCase.submittedAt ? (
          <Detail label="Submitted" value={formatDateTime(detail.approvalCase.submittedAt)} />
        ) : null}
        {detail.approvalCase.decidedAt ? (
          <Detail label="Last decision" value={formatDateTime(detail.approvalCase.decidedAt)} />
        ) : null}
      </dl>

      {detail.approvalCase.rejectionReason ? (
        <p className="text-caption text-text-secondary m-0">
          Last note: {detail.approvalCase.rejectionReason}
        </p>
      ) : null}
      {detail.approvalCase.suspensionReason ? (
        <p className="text-caption text-text-secondary m-0">
          Last note: {detail.approvalCase.suspensionReason}
        </p>
      ) : null}

      {actions.length ? (
        <div className="flex flex-wrap gap-2 border-t border-outline-subtle pt-3">
          {actions.map((action) => (
            <Button
              key={action.status}
              variant={action.danger ? "danger" : "secondary"}
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function confirmName(confirm: ConfirmTarget | null): string {
  if (!confirm) return "";
  if (confirm.kind === "member") return confirm.user.name;
  return (
    confirm.detail.application?.businessName ||
    confirm.detail.clientProfile?.businessName ||
    confirm.detail.applicant?.name ||
    "this application"
  );
}

function caseDecision(
  next: VerificationAction["status"],
  current: ApprovalCaseSummary["status"],
): ApprovalDecisionAction | null {
  if (next === "approved" && current === "suspended") return "restore";
  if (next === "approved") return "approve";
  if (next === "rejected") return "reject";
  if (next === "suspended") return "suspend";
  return null;
}

function businessApplicationActions(
  status: ApprovalCaseSummary["status"],
): VerificationAction[] {
  switch (status) {
    case "pending":
      return [
        {
          status: "approved",
          label: "Approve",
          consequence:
            "Converts this personal client into the requested business or organization. They keep personal ordering until this decision is made.",
        },
        {
          status: "rejected",
          label: "Reject",
          danger: true,
          consequence:
            "Leaves them as a personal client. Give a reason — it is the only explanation they receive.",
        },
      ];
    case "approved":
      return [
        {
          status: "suspended",
          label: "Suspend",
          danger: true,
          consequence:
            "Stops business ordering on this account. Personal orders continue.",
        },
      ];
    case "suspended":
      return [
        {
          status: "approved",
          label: "Reinstate",
          consequence: "Restores business ordering on this account.",
        },
      ];
    default:
      return [];
  }
}
