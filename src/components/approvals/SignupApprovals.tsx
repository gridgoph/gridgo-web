"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

/**
 * Supplier and rider sign-up approvals.
 *
 * Both roles now create their own accounts and can do nothing until someone
 * says yes: a pending supplier cannot be matched, and a pending rider cannot
 * accept a dispatch. This is the one implementation of that queue — Operations
 * mounts it at /ops/approvals and Super Admin inside /admin/verification.
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
import { listUsers, setUserVerification } from "@/lib/api/client";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import type { Taxonomy, User } from "@/lib/api/types";
import { getTaxonomy } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";

type Props = {
  /** Extra prose above the queue, when the mounting surface needs it. */
  intro?: string;
};

type Loaded = {
  people: User[];
  categoryNames: Record<string, string>;
};

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
  const [confirm, setConfirm] = useState<{
    user: User;
    action: VerificationAction;
  } | null>(null);
  const [reason, setReason] = useState("");

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [suppliers, riders, taxonomy] = await Promise.all([
          listUsers("supplier"),
          listUsers("rider"),
          getTaxonomy().catch(() => null as Taxonomy | null),
        ]);
        const categoryNames: Record<string, string> = {};
        for (const category of taxonomy?.categories ?? []) {
          categoryNames[category.code] = category.name;
        }
        setData({ people: [...suppliers, ...riders], categoryNames });
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

  const { waiting, decided } = useMemo(() => {
    const people = [...(data?.people ?? [])].sort((a, b) => {
      const rank =
        (ORDER[a.verificationStatus ?? "unverified"] ?? 9) -
        (ORDER[b.verificationStatus ?? "unverified"] ?? 9);
      if (rank !== 0) return rank;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
    return {
      waiting: people.filter(
        (u) =>
          u.verificationStatus === "pending" ||
          u.verificationStatus === "unverified" ||
          !u.verificationStatus,
      ),
      decided: people.filter(
        (u) =>
          u.verificationStatus === "approved" ||
          u.verificationStatus === "suspended" ||
          u.verificationStatus === "rejected",
      ),
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
            "Suppliers and riders sign themselves up. Until someone approves them they cannot be matched to an order or accept a delivery, so this queue is where new capacity comes from."}
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
          Waiting for a decision{data ? ` (${waiting.length})` : ""}
        </h2>
        {pending ? (
          <SkeletonCards count={2} lines={2} label="Loading sign-ups" />
        ) : !waiting.length ? (
          <EmptyState
            title="Nobody is waiting"
            body="Every supplier and rider who has signed up has had a decision. New sign-ups land here the moment they finish registering."
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Check again
              </Button>
            }
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {waiting.map((person) => (
              <ApplicantCard
                key={person.id}
                person={person}
                categoryNames={data?.categoryNames ?? {}}
                onAction={(action) => {
                  setActionError(null);
                  setReason("");
                  setConfirm({ user: person, action });
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {decided.length ? (
        <section aria-labelledby="decided-heading" className="flex flex-col gap-3">
          <h2 id="decided-heading" className="text-h3 text-text-primary m-0">
            Already decided ({decided.length})
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {decided.map((person) => (
              <ApplicantCard
                key={person.id}
                person={person}
                categoryNames={data?.categoryNames ?? {}}
                onAction={(action) => {
                  setActionError(null);
                  setReason("");
                  setConfirm({ user: person, action });
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
              {confirm?.action.label} {confirm?.user.name}?
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
