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
import { CircleCheck, TriangleAlert } from "lucide-react";

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
import {
  ReinstateDialog,
  type ReinstateResult,
} from "@/components/approvals/ReinstateDialog";
import {
  QUEUE_VIEW_LABEL,
  QUEUE_VIEWS,
  collectSuspendedAccounts,
  suspensionHeadline,
  suspensionReasonText,
  type QueueView,
  type SuspendedAccount,
} from "@/components/approvals/suspended-accounts";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SkeletonCards } from "@/components/ui/loading";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  ApprovalCaseQueue,
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
  /**
   * Which part of the queue to show. The pages keep it in `?show=` so Roles
   * can link straight to the suspended accounts; uncontrolled it starts on
   * everything.
   */
  view?: QueueView;
  onViewChange?: (view: QueueView) => void;
};

type Loaded = {
  people: User[];
  business: ApprovalCaseDetail[];
  suspended: SuspendedAccount[];
  categoryNames: Record<string, string>;
};

const NO_CASES: ApprovalCaseQueue = { approvalCases: [], nextCursor: null };

type ConfirmTarget =
  | { kind: "member"; user: User; action: VerificationAction }
  | { kind: "business"; detail: ApprovalCaseDetail; action: VerificationAction };

const BUSINESS_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;

/** Names for decision-makers the queue can already see, by user id. */
function nameDirectory(users: readonly User[]): Map<string, string> {
  return new Map(users.map((user) => [user.id, user.name]));
}

const ORDER: Record<string, number> = {
  pending: 0,
  unverified: 1,
  suspended: 2,
  approved: 3,
  rejected: 4,
};

export function SignupApprovals({ intro, view: controlledView, onViewChange }: Props) {
  const [ownView, setOwnView] = useState<QueueView>("all");
  const view = controlledView ?? ownView;
  const setView = (next: QueueView) => {
    setOwnView(next);
    onViewChange?.(next);
  };
  const [reinstating, setReinstating] = useState<SuspendedAccount | null>(null);
  const [reinstated, setReinstated] = useState<ReinstateResult | null>(null);
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
        const [suppliers, riders, taxonomy, suspendedCases, ...businessPages] =
          await Promise.all([
            listUsers("supplier"),
            listUsers("rider"),
            getTaxonomy().catch(() => null as Taxonomy | null),
            // Every kind at once: supplier and rider suspensions carry their
            // reason, time and decider here, and only a case can restore lines.
            listApprovalCases({ status: "suspended" }).catch(() => NO_CASES),
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
        const people = [...suppliers, ...riders];
        const directory = nameDirectory(people);
        const deciders = [
          ...suspendedCases.approvalCases.filter((item) => !item.decidedByName),
          ...business
            .map((detail) => detail.approvalCase)
            .filter((c) => !c.decidedByName),
        ]
          .map((item) => item.decidedBy)
          .concat(people.map((person) => person.verifiedBy));
        // Suspensions are made by Operations or Super Admin, who are not in the
        // shop and rider lists. Only when the API did not name them, read the
        // directory once; a refusal just leaves the name out.
        if (deciders.some((id) => id && !directory.has(id))) {
          for (const user of await listUsers().catch(() => [] as User[])) {
            directory.set(user.id, user.name);
          }
        }
        const suspended = collectSuspendedAccounts({
          cases: suspendedCases.approvalCases,
          people,
          business,
          directory,
        });
        setData({ people, business, suspended, categoryNames });
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
        (u) => u.verificationStatus === "approved" || u.verificationStatus === "rejected",
      ),
      waitingBusiness: business.filter((item) => item.approvalCase.status === "pending"),
      decidedBusiness: business.filter(
        (item) =>
          item.approvalCase.status === "approved" ||
          item.approvalCase.status === "rejected",
      ),
    };
  }, [data]);
  const suspended = data?.suspended ?? [];
  const counts: Record<QueueView, number | null> = {
    all: null,
    waiting: data ? waiting.length + waitingBusiness.length : null,
    suspended: data ? suspended.length : null,
    decided: data ? decided.length + decidedBusiness.length : null,
  };

  async function apply() {
    if (!confirm) return;
    if (confirm.action.status === "rejected" && !reason.trim()) {
      setActionError("Give a reason. It is the only explanation this person receives.");
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    setReinstated(null);
    try {
      if (confirm.kind === "business") {
        const decision = caseDecision(confirm.action.status);
        if (!decision) {
          setActionError("That decision is not available for this application.");
          setBusy(false);
          return;
        }
        const note = reason.trim();
        await decideApprovalCase(confirm.detail.approvalCase.id, decision, {
          expectedVersion: confirm.detail.approvalCase.version,
          requestId: crypto.randomUUID(),
          ...(decision === "approve" ? { note: note || undefined } : {}),
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

  const show = (section: Exclude<QueueView, "all">) => view === "all" || view === section;

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

      <ToggleGroup
        value={[view]}
        onValueChange={(values) => {
          const next = values[0] as QueueView | undefined;
          if (next) setView(next);
        }}
        variant="outline"
        spacing={0}
        aria-label="Show accounts"
        className="flex-wrap"
      >
        {QUEUE_VIEWS.map((option) => (
          <ToggleGroupItem key={option} value={option} className="min-h-11 gap-1.5 px-3">
            {QUEUE_VIEW_LABEL[option]}
            {counts[option] !== null ? (
              <span className="text-text-muted tabular-nums">{counts[option]}</span>
            ) : null}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}
      {reinstated ? <ReinstatedNotice result={reinstated} /> : null}
      {actionError && !confirm ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      {show("waiting") ? (
        <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
          <h2 id="waiting-heading" className="text-h3 text-text-primary m-0">
            Waiting for a decision
            {data ? ` (${waiting.length + waitingBusiness.length})` : ""}
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
      ) : null}

      {show("suspended") && (suspended.length || view === "suspended") ? (
        <section aria-labelledby="suspended-heading" className="flex flex-col gap-3">
          <h2 id="suspended-heading" className="text-h3 text-text-primary m-0">
            Suspended{data ? ` (${suspended.length})` : ""}
          </h2>
          {pending ? (
            <SkeletonCards count={1} lines={2} label="Loading suspended accounts" />
          ) : !suspended.length ? (
            <EmptyState
              title="Nobody is suspended"
              body="Every supplier, rider, and business client is either working or waiting for a decision. A suspended account shows here with who suspended it and why."
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {suspended.map((account) => (
                <SuspendedAccountCard
                  key={account.key}
                  account={account}
                  onReinstate={() => {
                    setActionError(null);
                    setActionOk(null);
                    setReinstated(null);
                    setReinstating(account);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {show("decided") &&
      (decided.length || decidedBusiness.length || view === "decided") ? (
        <section aria-labelledby="decided-heading" className="flex flex-col gap-3">
          <h2 id="decided-heading" className="text-h3 text-text-primary m-0">
            Already decided{data ? ` (${decided.length + decidedBusiness.length})` : ""}
          </h2>
          {pending ? (
            <SkeletonCards count={1} lines={2} label="Loading decided accounts" />
          ) : !decided.length && !decidedBusiness.length ? (
            <EmptyState
              title="Nothing decided yet"
              body="Approved and rejected accounts collect here once someone decides on a sign-up."
            />
          ) : (
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
          )}
        </section>
      ) : null}

      <ReinstateDialog
        account={reinstating}
        onClose={() => setReinstating(null)}
        onReinstated={(result) => {
          setReinstating(null);
          setReinstated(result);
          void load();
        }}
      />
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
        {detail.applicant?.phone ? (
          <Detail label="Phone" value={detail.applicant.phone} />
        ) : null}
        {detail.approvalCase.submittedAt ? (
          <Detail
            label="Submitted"
            value={formatDateTime(detail.approvalCase.submittedAt)}
          />
        ) : null}
        {detail.approvalCase.decidedAt ? (
          <Detail
            label="Last decision"
            value={formatDateTime(detail.approvalCase.decidedAt)}
          />
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

/** Reinstating a suspended case is `ReinstateDialog`'s job, not this one's. */
function caseDecision(next: VerificationAction["status"]): ApprovalDecisionAction | null {
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
    default:
      return [];
  }
}

/**
 * A suspended account leads with why it is out: who suspended it, when, and
 * the reason they gave. Reinstate is the card's one action.
 */
function SuspendedAccountCard({
  account,
  onReinstate,
}: {
  account: SuspendedAccount;
  onReinstate: () => void;
}) {
  const reason = suspensionReasonText(account.reason);
  const user = account.user;
  return (
    <li className="gg-card flex flex-col gap-3">
      <ApplicantHeader
        title={account.title}
        caption={account.caption}
        status={presentVerification("suspended")}
      />

      <div
        className="flex flex-col gap-3 rounded-field border border-error px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        role="note"
        aria-label={`${account.title} is suspended`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-error" aria-hidden />
          <p className="text-body text-text-primary m-0 min-w-0 break-words">
            <span style={{ fontFamily: "var(--font-medium)" }}>
              {suspensionHeadline(account)}:
            </span>{" "}
            {reason ?? (
              <span className="text-text-secondary">no reason was recorded</span>
            )}
          </p>
        </div>
        <Button
          variant="primary"
          className="shrink-0 self-start sm:self-center"
          onClick={onReinstate}
        >
          Reinstate
        </Button>
      </div>

      {user ? (
        <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {user.phone ? <Detail label="Phone" value={user.phone} /> : null}
          {user.shop?.label ? <Detail label="Shop" value={user.shop.label} /> : null}
          {user.createdAt ? (
            <Detail label="Signed up" value={formatDateTime(user.createdAt)} />
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}

/** What reinstating brought back, and what it deliberately left down. */
function ReinstatedNotice({ result }: { result: ReinstateResult }) {
  return (
    <div
      className="flex items-start gap-2 rounded-card border border-success px-4 py-3"
      role="status"
    >
      <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {result.headline}
        </p>
        {result.restored.length ? (
          <p className="text-body text-text-secondary m-0">
            Back live: {result.restored.join(", ")}.
          </p>
        ) : null}
        {result.stillSuspended.length ? (
          <p className="text-body text-text-secondary m-0">
            Still suspended: {result.stillSuspended.join(", ")}. Review{" "}
            {result.stillSuspended.length === 1 ? "it" : "them"} on the Service lines tab.
          </p>
        ) : null}
      </div>
    </div>
  );
}
