"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, RotateCcw, ShieldAlert, TriangleAlert, UserCog, UserX } from "lucide-react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  ASSIGNABLE_ROLES,
  presentRole,
  roleChangeConsequence,
} from "@/app/admin/_lib/present";
import {
  suspendedQueueHref,
  suspensionHeadline,
  suspensionReasonText,
  suspensionsByUser,
  type UserSuspension,
} from "@/components/approvals/suspended-accounts";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
  type DataTableFacet,
} from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/StatusChip";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listApprovalCases, listUsers, updateUserAccount, updateUserRole } from "@/lib/api/client";
import type { Role, User } from "@/lib/api/types";

const SUSPENDED = "Suspended";
const ACTIVE = "Active";

type AccountAction = "suspend" | "remove" | "restore";

function accountLabel(user: User): string {
  if (user.accountStatus === "suspended") return "Suspended";
  if (user.accountStatus === "removed") return "Removed";
  return "Active";
}

function accountConsequence(action: AccountAction): string {
  if (action === "suspend") {
    return "They stay in this directory and their sign-in stays valid. The app replaces their workspace with this reason until you restore the account. Accreditation is unchanged.";
  }
  if (action === "remove") {
    return "This does not delete the person, their orders, or their sign-in. They stay in this directory and see this reason instead of the app until you restore the account.";
  }
  return "They can use GRIDGO again. The reason stored on the account is cleared. This note stays on the audit log.";
}

export default function AdminRolesPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [suspensions, setSuspensions] = useState<Map<string, UserSuspension>>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [target, setTarget] = useState<User | null>(null);
  const [nextRole, setNextRole] = useState<Role | null>(null);
  const [reason, setReason] = useState("");
  const [typedConfirm, setTypedConfirm] = useState("");
  const [accountTarget, setAccountTarget] = useState<User | null>(null);
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null);
  const [accountReason, setAccountReason] = useState("");
  const [accountTypedConfirm, setAccountTypedConfirm] = useState("");

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [directory, suspendedCases] = await Promise.all([
          listUsers(),
          // A suspension without this list still shows from the person's own
          // status; the case adds business clients and the reason.
          listApprovalCases({ status: "suspended" }).catch(() => null),
        ]);
        setUsers(directory);
        setSuspensions(
          suspensionsByUser({
            cases: suspendedCases?.approvalCases ?? [],
            users: directory,
            directory: new Map(directory.map((user) => [user.id, user.name])),
          }),
        );
      } catch (err) {
        setUsers(null);
        setError(
          adminErrorMessage(
            err,
            "Could not load the user directory. Confirm the demo API is running.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["identity", "approvals"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<DataTableColumn<User>[]>(
    () => [
      {
        id: "name",
        header: "Person",
        primary: true,
        sortValue: (u) => u.name,
        filterValue: (u) =>
          `${u.name} ${u.email} ${u.orgName ?? ""} ${u.supplierName ?? ""}`,
        cell: (u) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {u.name}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">{u.email}</p>
          </div>
        ),
      },
      {
        id: "role",
        header: "Platform role",
        sortValue: (u) => presentRole(u.role),
        filterValue: (u) => presentRole(u.role),
        cell: (u) => (
          <span className="text-body text-text-primary">{presentRole(u.role)}</span>
        ),
      },
      {
        id: "account",
        header: "Account",
        sortValue: (u) => `${accountLabel(u)} ${suspensions.has(u.id) ? SUSPENDED : ACTIVE}`,
        filterValue: (u) => `${accountLabel(u)} ${u.accountStatusReason ?? ""}`,
        cell: (u) => {
          const suspension = suspensions.get(u.id);
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <p className="text-body text-text-primary m-0">{accountLabel(u)}</p>
              {u.accountStatusReason ? (
                <p className="text-caption text-text-muted m-0">{u.accountStatusReason}</p>
              ) : null}
              {suspension ? (
                <>
                  <StatusChip tone="error" label={SUSPENDED} icon="triangle-alert" />
                  <span className="text-caption text-text-muted line-clamp-2 max-w-72 whitespace-normal">
                    {suspensionHeadline(suspension)}
                    {suspensionReasonText(suspension.reason)
                      ? `: ${suspensionReasonText(suspension.reason)}`
                      : ""}
                  </span>
                </>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "org",
        header: "Organisation",
        sortValue: (u) => u.orgName || u.supplierName || "",
        cell: (u) => (
          <span className="text-body text-text-secondary">
            {u.orgName || u.supplierName || "—"}
          </span>
        ),
      },
    ],
    [suspensions],
  );

  const facets = useMemo<DataTableFacet[]>(
    () => [
      {
        columnId: "account",
        title: "Account",
        options: [
          { value: SUSPENDED, label: SUSPENDED, icon: TriangleAlert },
          { value: ACTIVE, label: ACTIVE },
        ],
      },
    ],
    [],
  );
  const suspendedCount = suspensions.size;

  const isHighRisk = Boolean(
    target &&
    nextRole &&
    nextRole !== target.role &&
    (nextRole === "super_admin" || target.role === "super_admin"),
  );

  const confirmPhrase = target ? target.email : "";
  const canSubmit =
    !!target &&
    !!nextRole &&
    nextRole !== target.role &&
    reason.trim().length > 0 &&
    (!isHighRisk || typedConfirm === confirmPhrase);

  async function applyRole() {
    if (!target || !nextRole || !canSubmit) return;
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await updateUserRole(target.id, {
        role: nextRole,
        reason: reason.trim(),
      });
      setActionOk(
        `${target.name} is now ${presentRole(nextRole)}. The change is on the audit log.`,
      );
      setTarget(null);
      setNextRole(null);
      setReason("");
      setTypedConfirm("");
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not change the role."));
    } finally {
      setBusy(false);
    }
  }

  const accountHighRisk = Boolean(
    accountTarget &&
    (accountAction === "remove" ||
      (accountAction === "suspend" && accountTarget.role === "super_admin")),
  );
  const accountPhrase = accountTarget ? accountTarget.email : "";
  const canSubmitAccount =
    !!accountTarget &&
    !!accountAction &&
    accountReason.trim().length > 0 &&
    (!accountHighRisk || accountTypedConfirm === accountPhrase);

  function openAccount(user: User, action: AccountAction) {
    setAccountTarget(user);
    setAccountAction(action);
    setAccountReason("");
    setAccountTypedConfirm("");
    setActionError(null);
  }

  function closeAccount() {
    setAccountTarget(null);
    setAccountAction(null);
    setAccountReason("");
    setAccountTypedConfirm("");
    setActionError(null);
  }

  async function applyAccount() {
    if (!accountTarget || !accountAction || !canSubmitAccount) return;
    const status =
      accountAction === "restore"
        ? "active"
        : accountAction === "suspend"
          ? "suspended"
          : "removed";
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await updateUserAccount(accountTarget.id, {
        status,
        reason: accountReason.trim(),
      });
      const verb =
        accountAction === "restore"
          ? "restored"
          : accountAction === "suspend"
            ? "suspended"
            : "removed";
      setActionOk(
        `${accountTarget.name} is ${verb}. The reason is on the audit log.`,
      );
      closeAccount();
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not update the account."));
    } finally {
      setBusy(false);
    }
  }

  const accountTitle =
    accountAction === "suspend"
      ? "Suspend"
      : accountAction === "remove"
        ? "Remove"
        : "Restore";

  const pending = loading && !users;

  if (!pending && (error || !users)) {
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
          Platform role changes are the highest-blast-radius control in GRIDGO. Granting
          Super Admin creates another full administrator; removing it revokes governance
          access immediately. Suspending or removing an account keeps the person in this
          directory. They stay signed in and see your reason instead of the app. Every
          change is audited.
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

      {suspendedCount ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-error px-4 py-3"
          role="note"
        >
          <p className="text-body text-text-primary m-0 flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-error" aria-hidden />
            {suspendedCount === 1
              ? "1 account is suspended. Its reason and the way back are on Accreditation."
              : `${suspendedCount} accounts are suspended. Their reasons and the way back are on Accreditation.`}
          </p>
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href={suspendedQueueHref("admin")} />}
          >
            Review suspended accounts
          </Button>
        </div>
      ) : null}

      {!pending && !users?.length ? (
        <EmptyState
          title="No users"
          body="The directory is empty. Users appear once accounts exist on the demo API."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={users ?? []}
          loading={pending}
          getRowId={(u) => u.id}
          caption="Platform users and roles"
          filterPlaceholder="Filter people…"
          itemLabel="people"
          defaultSortId="role"
          facets={facets}
          rowActions={(u) => {
            const status = u.accountStatus ?? "active";
            return (
              <>
                {suspensions.has(u.id) ? (
                  <DataTableRowAction
                    label="Review suspension"
                    icon={ShieldAlert}
                    href={suspendedQueueHref("admin")}
                  />
                ) : null}
                <DataTableRowAction
                  label="Change role"
                  icon={UserCog}
                  onClick={() => {
                    setTarget(u);
                    setNextRole(u.role);
                    setReason("");
                    setTypedConfirm("");
                    setActionError(null);
                  }}
                />
                {status !== "suspended" ? (
                  <DataTableRowAction
                    label="Suspend"
                    icon={Ban}
                    onClick={() => openAccount(u, "suspend")}
                  />
                ) : null}
                {status !== "removed" ? (
                  <DataTableRowAction
                    label="Remove"
                    icon={UserX}
                    variant="danger"
                    onClick={() => openAccount(u, "remove")}
                  />
                ) : null}
                {status === "suspended" || status === "removed" ? (
                  <DataTableRowAction
                    label="Restore"
                    icon={RotateCcw}
                    onClick={() => openAccount(u, "restore")}
                  />
                ) : null}
              </>
            );
          }}
        />
      )}

      <AlertDialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setNextRole(null);
            setReason("");
            setTypedConfirm("");
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Change role for {target?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Currently {target ? presentRole(target.role) : ""}. Role changes are written
              to the platform audit log with your reason.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel>New role</FieldLabel>
              <Select
                value={nextRole ?? undefined}
                onValueChange={(v) => setNextRole(v as Role)}
              >
                <SelectTrigger className="min-h-11 w-full">
                  <SelectValue placeholder="Choose a role">
                    {(v) => (v ? presentRole(v as Role) : "Choose a role")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {presentRole(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {target && nextRole && nextRole !== target.role ? (
              <div
                className="rounded-field border border-outline bg-surface-variant px-3 py-3"
                role="note"
              >
                <p className="text-body text-text-primary m-0">
                  {roleChangeConsequence(target.role, nextRole)}
                </p>
              </div>
            ) : null}

            <Field>
              <FieldLabel htmlFor="role-reason">
                Reason (required — stored on the audit log)
              </FieldLabel>
              <Textarea
                id="role-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why this person should hold this role"
                required
              />
            </Field>

            {isHighRisk ? (
              <Field>
                <FieldLabel htmlFor="role-confirm">
                  Type {confirmPhrase} to confirm this high-risk change
                </FieldLabel>
                <Input
                  id="role-confirm"
                  value={typedConfirm}
                  onChange={(e) => setTypedConfirm(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            ) : null}
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
                setTarget(null);
                setNextRole(null);
                setReason("");
                setTypedConfirm("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={isHighRisk ? "danger" : "primary"}
              disabled={busy || !canSubmit}
              onClick={() => void applyRole()}
            >
              {busy ? "Saving…" : "Confirm role change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!accountTarget}
        onOpenChange={(open) => {
          if (!open) closeAccount();
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accountTitle} {accountTarget?.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Currently {accountTarget ? accountLabel(accountTarget).toLowerCase() : ""}. The
              reason is written to the account and the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <FieldGroup>
            <div
              className="rounded-field border border-outline bg-surface-variant px-3 py-3"
              role="note"
            >
              <p className="text-body text-text-primary m-0">
                {accountAction ? accountConsequence(accountAction) : ""}
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="account-reason">
                Reason (required — stored on the account and the audit log)
              </FieldLabel>
              <Textarea
                id="account-reason"
                value={accountReason}
                onChange={(e) => setAccountReason(e.target.value)}
                rows={3}
                placeholder="Why this account should change"
                required
              />
            </Field>

            {accountHighRisk ? (
              <Field>
                <FieldLabel htmlFor="account-confirm">
                  Type {accountPhrase} to confirm this high-risk change
                </FieldLabel>
                <Input
                  id="account-confirm"
                  value={accountTypedConfirm}
                  onChange={(e) => setAccountTypedConfirm(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            ) : null}
          </FieldGroup>

          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={busy} onClick={closeAccount}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={accountHighRisk ? "danger" : "primary"}
              disabled={busy || !canSubmitAccount}
              onClick={() => void applyAccount()}
            >
              {busy ? "Saving…" : `Confirm ${accountTitle.toLowerCase()}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
