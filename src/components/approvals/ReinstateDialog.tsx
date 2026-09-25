"use client";

/**
 * Bring a suspended account back, and with it the service lines that went
 * down with it.
 *
 * A supplier suspension also suspends every live line. Reinstating the account
 * alone left those lines dark without saying so; this dialog lists them, ticks
 * the ones suspended with the account, and restores them in the same step
 * (`restoreServiceIds`). A line suspended on its own is shown but cannot be
 * ticked — it is reviewed on the Service lines tab.
 */

import { useEffect, useState } from "react";

import {
  preselectedServiceIds,
  reinstateConsequence,
  reinstateOutcome,
  suspensionBannerText,
  type SuspendedAccount,
} from "@/components/approvals/suspended-accounts";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import {
  decideApprovalCase,
  getApprovalCase,
  setUserVerification,
} from "@/lib/api/client";
import type { ApprovalCaseDetail, SuspendedServiceLine } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export type ReinstateResult = {
  name: string;
  headline: string;
  restored: string[];
  stillSuspended: string[];
};

type Props = {
  account: SuspendedAccount | null;
  onClose: () => void;
  onReinstated: (result: ReinstateResult) => void;
};

export function ReinstateDialog({ account, onClose, onReinstated }: Props) {
  return (
    <AlertDialog
      open={!!account}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent className="sm:max-w-lg">
        {account ? (
          <ReinstateForm
            key={account.key}
            account={account}
            onClose={onClose}
            onReinstated={onReinstated}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReinstateForm({
  account,
  onClose,
  onReinstated,
}: {
  account: SuspendedAccount;
  onClose: () => void;
  onReinstated: (result: ReinstateResult) => void;
}) {
  const [detail, setDetail] = useState<ApprovalCaseDetail | null>(null);
  const [loadingLines, setLoadingLines] = useState(account.caseId !== null);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per open dialog, so a retried press is the same decision.
  const [requestId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!account.caseId) return;
    let cancelled = false;
    getApprovalCase(account.caseId)
      .then((fresh) => {
        if (cancelled) return;
        setDetail(fresh);
        setSelected(preselectedServiceIds(fresh.suspendedServiceLines ?? []));
      })
      .catch(() => {
        // The list is a courtesy; the restore itself still works on the
        // version the queue already has.
      })
      .finally(() => {
        if (!cancelled) setLoadingLines(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account.caseId]);

  // null: this API cannot list or restore lines (older server, legacy account).
  const lines: SuspendedServiceLine[] | null =
    account.kind !== "supplier"
      ? []
      : account.caseId
        ? (detail?.suspendedServiceLines ?? null)
        : null;
  const consequence = reinstateConsequence({
    name: account.title,
    kind: account.kind,
    lines,
    selected,
  });

  async function submit() {
    const trimmed = note.trim();
    if (!trimmed) {
      setError("Add a note for the record before reinstating this account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (account.caseId) {
        const restoreServiceIds = lines?.length && selected.length ? selected : undefined;
        const result = await decideApprovalCase(account.caseId, "restore", {
          expectedVersion: detail?.approvalCase.version ?? account.caseVersion ?? 1,
          requestId,
          note: trimmed,
          ...(restoreServiceIds ? { restoreServiceIds } : {}),
        });
        onReinstated({
          name: account.title,
          ...reinstateOutcome({
            name: account.title,
            lines,
            requested: restoreServiceIds ?? [],
            restoredServiceIds: result.restoredServiceIds,
          }),
        });
      } else {
        await setUserVerification(account.userId, {
          status: "approved",
          note: trimmed,
          reason: trimmed,
        });
        onReinstated({
          name: account.title,
          ...reinstateOutcome({
            name: account.title,
            lines: null,
            requested: [],
            restoredServiceIds: [],
          }),
        });
      }
    } catch (err) {
      setError(opsErrorMessage(err, "Could not reinstate this account. Try again."));
      setBusy(false);
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Reinstate {account.title}?</AlertDialogTitle>
        <AlertDialogDescription>{suspensionBannerText(account)}</AlertDialogDescription>
      </AlertDialogHeader>

      <FieldGroup>
        {account.kind === "supplier" && account.caseId ? (
          loadingLines ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">Checking which service lines are suspended</span>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : lines?.length ? (
            <FieldSet>
              <FieldLegend variant="label">Service lines to bring back</FieldLegend>
              <FieldDescription>
                Ticked lines were suspended with the account. Untick any that should stay
                down.
              </FieldDescription>
              <ul className="m-0 mt-1 flex list-none flex-col p-0">
                {lines.map((line) => (
                  <ServiceLineChoice
                    key={line.id}
                    line={line}
                    checked={selected.includes(line.id)}
                    onChange={(checked) =>
                      setSelected((prev) =>
                        checked
                          ? [...prev.filter((id) => id !== line.id), line.id]
                          : prev.filter((id) => id !== line.id),
                      )
                    }
                  />
                ))}
              </ul>
            </FieldSet>
          ) : null
        ) : null}

        <p
          className="text-body text-text-primary m-0 rounded-field border border-outline bg-surface-variant px-3 py-3"
          role="note"
        >
          {consequence}
        </p>

        <Field data-invalid={error && !note.trim() ? true : undefined}>
          <FieldLabel htmlFor="reinstate-note">Note for the record (required)</FieldLabel>
          <Textarea
            id="reinstate-note"
            rows={3}
            value={note}
            required
            aria-invalid={error && !note.trim() ? true : undefined}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Rent settled; spoke to the owner on 25 Sep"
          />
          <FieldDescription>
            Stored against the account with your name and the time.
          </FieldDescription>
        </Field>
      </FieldGroup>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <AlertDialogFooter>
        <AlertDialogCancel variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          variant="primary"
          disabled={busy || loadingLines}
          onClick={() => void submit()}
        >
          {busy ? "Reinstating…" : "Reinstate"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

function ServiceLineChoice({
  line,
  checked,
  onChange,
}: {
  line: SuspendedServiceLine;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const nameId = `reinstate-line-${line.id}`;
  const since = line.suspendedAt ? ` on ${formatDate(line.suspendedAt)}` : "";
  return (
    <li>
      <label className="flex min-h-11 items-start gap-3 py-1.5">
        <Checkbox
          className="mt-1"
          checked={checked}
          disabled={!line.suspendedWithAccount}
          aria-labelledby={nameId}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <span className="min-w-0">
          <span id={nameId} className="text-body text-text-primary block">
            {line.name}
          </span>
          <span className="text-caption text-text-muted block">
            {line.suspendedWithAccount
              ? `Suspended with the account${since}`
              : `Suspended on its own${since}. Review it on the Service lines tab.`}
          </span>
        </span>
      </label>
    </li>
  );
}
