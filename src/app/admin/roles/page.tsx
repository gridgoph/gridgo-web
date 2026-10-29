"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, Eye, RotateCcw, ShieldAlert, TriangleAlert, UserCog, UserX } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  listApprovalCases,
  listUsers,
  updateUserAccount,
  updateUserRole,
} from "@/lib/api/client";
import type { Role, User } from "@/lib/api/types";
import {
  FOUNDING_TESTER_LABEL,
  showsFoundingTesterBadge,
  TESTER_FILTERS,
  testerFilterQuery,
  type TesterFilter,
} from "@/lib/founding-testers";

// Account is accreditation (the approval case); Standing is whether the person
// may use GRIDGO at all. They are independent, so each has its own column and
// facet, and a facet value must equal its column's `sortValue` exactly.
const SUSPENDED = "Suspended";
const ACTIVE = "Active";
const STANDING_ACTIVE = "Active";
const STANDING_SUSPENDED = "Suspended";
const STANDING_REMOVED = "Removed";

type AccountAction = "suspend" | "remove" | "restore";

function standingLabel(user: User): string {
  if (user.accountStatus === "suspended") return STANDING_SUSPENDED;
  if (user.accountStatus === "removed") return STANDING_REMOVED;
  return STANDING_ACTIVE;
}

const NO_SIGN_IN = "No sign-in recorded";

type RolesTab = "directory" | "sign-ins";
type SignInSort = "latest" | "oldest";
type SignInFilter = "all" | "signed-in" | "none";

/** Manila date and time. Account creation is not a sign-in. */
function formatLastSignedIn(iso: string | null | undefined): string {
  if (!iso) return NO_SIGN_IN;
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return NO_SIGN_IN;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(parsed);
}

function signedInMillis(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function accountConsequence(action: AccountAction): string {
  if (action === "suspend") {
    return "This suspends the account. They stay in this directory and their sign-in stays valid. The app replaces their workspace with this reason until you restore the account. Accreditation is unchanged.";
  }
  if (action === "remove") {
    return "This does not delete the person, their orders, or their sign-in. They stay in this directory and see this reason instead of the app until you restore the account.";
  }
  return "They can use GRIDGO again. The reason stored on the account is cleared. This note stays on the audit log.";
}

function AdminRolesPage() {
  const search = useSearchParams();
  const router = useRouter();
  const requested: RolesTab = search.get("tab") === "sign-ins" ? "sign-ins" : "directory";
  const [tab, setTab] = useState<RolesTab>(requested);
  const [signInSort, setSignInSort] = useState<SignInSort>("latest");
  const [signInFilter, setSignInFilter] = useState<SignInFilter>("all");
  const [users, setUsers] = useState<User[] | null>(null);
  // Sign-ins always lists every account; the Founding Tester filter is Directory's.
  const [signInUsers, setSignInUsers] = useState<User[] | null>(null);
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
  // Founding Testers / Not yet ask the API for client rows only.
  const [testerFilter, setTesterFilter] = useState<TesterFilter>("all");
  // The filter the rows on screen answer; a newer choice shows skeleton rows.
  const [shownFilter, setShownFilter] = useState<TesterFilter>("all");

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      const query = testerFilterQuery(testerFilter);
      try {
        const [everyone, directory, suspendedCases] = await Promise.all([
          testerFilter === "all" ? null : listUsers(),
          listUsers(query.role, { foundingTester: query.foundingTester }),
          // A suspension without this list still shows from the person's own
          // status; the case adds business clients and the reason.
          listApprovalCases({ status: "suspended" }).catch(() => null),
        ]);
        setUsers(directory);
        setSignInUsers(everyone ?? directory);
        setShownFilter(testerFilter);
        setSuspensions(
          suspensionsByUser({
            cases: suspendedCases?.approvalCases ?? [],
            users: directory,
            directory: new Map(directory.map((user) => [user.id, user.name])),
          }),
        );
      } catch (err) {
        setUsers(null);
        setSignInUsers(null);
        setError(
          adminErrorMessage(
            err,
            "Could not load the user directory. Confirm the demo API is running.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, [testerFilter]),
  );

  useLiveReload(["identity", "approvals"], load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTab(requested);
  }, [requested]);

  function selectTab(value: string) {
    if (value !== "directory" && value !== "sign-ins") return;
    setTab(value);
    const next = new URLSearchParams(search.toString());
    if (value === "directory") next.delete("tab");
    else next.set("tab", "sign-ins");
    const query = next.toString();
    router.replace(query ? `/admin/roles?${query}` : "/admin/roles", { scroll: false });
  }

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
        cell: (u) =>
          showsFoundingTesterBadge(u) ? (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <span className="text-body text-text-primary">{presentRole(u.role)}</span>
              <StatusChip tone="info" label={FOUNDING_TESTER_LABEL} icon="award" />
            </div>
          ) : (
            <span className="text-body text-text-primary">{presentRole(u.role)}</span>
          ),
      },
      {
        id: "account",
        header: "Account",
        sortValue: (u) => (suspensions.has(u.id) ? SUSPENDED : ACTIVE),
        cell: (u) => {
          const suspension = suspensions.get(u.id);
          if (!suspension) {
            return <span className="text-body text-text-secondary">{ACTIVE}</span>;
          }
          const reason = suspensionReasonText(suspension.reason);
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <StatusChip tone="error" label={SUSPENDED} icon="triangle-alert" />
              <span className="text-caption text-text-muted line-clamp-2 max-w-72 whitespace-normal">
                {suspensionHeadline(suspension)}
                {reason ? `: ${reason}` : ""}
              </span>
            </div>
          );
        },
      },
      {
        id: "standing",
        header: "Standing",
        sortValue: (u) => standingLabel(u),
        filterValue: (u) => `${standingLabel(u)} ${u.accountStatusReason ?? ""}`,
        cell: (u) => {
          const status = u.accountStatus ?? "active";
          if (status === "active") {
            return (
              <span className="text-body text-text-secondary">{STANDING_ACTIVE}</span>
            );
          }
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <StatusChip
                tone={status === "removed" ? "error" : "warning"}
                label={standingLabel(u)}
                icon={status === "removed" ? "circle-x" : "ban"}
              />
              {u.accountStatusReason ? (
                <span className="text-caption text-text-muted line-clamp-2 max-w-72 whitespace-normal">
                  {u.accountStatusReason}
                </span>
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
      {
        id: "signedIn",
        header: "Last signed in",
        cell: (u) => (
          <span className="text-body text-text-secondary">
            {formatLastSignedIn(u.lastAuthenticatedAt)}
          </span>
        ),
      },
    ],
    [suspensions],
  );

  const signInColumns = useMemo<DataTableColumn<User>[]>(
    () => [
      {
        id: "name",
        header: "Person",
        primary: true,
        filterValue: (u) => `${u.name} ${u.email}`,
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
        filterValue: (u) => presentRole(u.role),
        cell: (u) => (
          <span className="text-body text-text-primary">{presentRole(u.role)}</span>
        ),
      },
      {
        id: "signedIn",
        header: "Last signed in",
        cell: (u) => (
          <span className="text-body text-text-secondary">
            {formatLastSignedIn(u.lastAuthenticatedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const signInRows = useMemo(() => {
    const rows = (signInUsers ?? []).filter((user) => {
      const recorded = signedInMillis(user.lastAuthenticatedAt) != null;
      if (signInFilter === "signed-in") return recorded;
      if (signInFilter === "none") return !recorded;
      return true;
    });
    rows.sort((left, right) => {
      const leftAt = signedInMillis(left.lastAuthenticatedAt);
      const rightAt = signedInMillis(right.lastAuthenticatedAt);
      if (leftAt == null && rightAt == null) return left.name.localeCompare(right.name);
      if (leftAt == null) return 1;
      if (rightAt == null) return -1;
      return signInSort === "latest" ? rightAt - leftAt : leftAt - rightAt;
    });
    return rows;
  }, [signInUsers, signInFilter, signInSort]);

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
      {
        columnId: "standing",
        title: "Standing",
        options: [
          { value: STANDING_ACTIVE, label: STANDING_ACTIVE },
          { value: STANDING_SUSPENDED, label: STANDING_SUSPENDED, icon: Ban },
          { value: STANDING_REMOVED, label: STANDING_REMOVED, icon: UserX },
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
      setActionOk(`${accountTarget.name} is ${verb}. The reason is on the audit log.`);
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
      ? "Suspend account"
      : accountAction === "remove"
        ? "Remove account"
        : "Restore account";
  const accountConfirm =
    accountAction === "suspend"
      ? "Confirm suspension"
      : accountAction === "remove"
        ? "Confirm removal"
        : "Confirm restore";

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
          access immediately. Suspending or removing an account changes its Standing, not
          its accreditation in the Account column. The person stays in this directory,
          stays signed in, and sees your reason instead of the app. Every change is
          audited.
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

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="sign-ins">Sign-ins</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="mt-4 flex flex-col gap-3">
      {tab === "directory" ? (
      <>
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-caption text-text-muted" id="tester-filter-label">
          Founding Tester
        </span>
        <ToggleGroup
          value={[testerFilter]}
          onValueChange={(values) => {
            const next = values[0] as TesterFilter | undefined;
            if (next) setTesterFilter(next);
          }}
          variant="outline"
          spacing={0}
          aria-labelledby="tester-filter-label"
        >
          {TESTER_FILTERS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {testerFilter !== "all" ? (
          <span className="text-caption text-text-muted">Client accounts only.</span>
        ) : null}
      </div>

      {!pending && !users?.length && shownFilter !== "all" ? (
        <EmptyState
          title={
            shownFilter === "earned" ? "No Founding Testers yet" : "Every client has the label"
          }
          body={
            shownFilter === "earned"
              ? "A client earns the label by placing, receiving and rating an order."
              : "No client account is still working towards the Founding Tester label."
          }
          action={
            <Button variant="secondary" onClick={() => setTesterFilter("all")}>
              Show everyone
            </Button>
          }
        />
      ) : !pending && !users?.length ? (
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
          loading={pending || shownFilter !== testerFilter}
          getRowId={(u) => u.id}
          caption="Platform users and roles"
          filterPlaceholder="Filter people…"
          itemLabel="people"
          defaultSortId="role"
          facets={facets}
          rowActionsDensity="labeled"
          rowActions={(u) => {
            const status = u.accountStatus ?? "active";
            return (
              <>
                {u.role === "client" ? (
                  <DataTableRowAction
                    label="Open client account"
                    icon={Eye}
                    href={`/admin/founding-testers/${encodeURIComponent(u.id)}`}
                  />
                ) : null}
                {suspensions.has(u.id) ? (
                  <DataTableRowAction
                    label="Review suspension"
                    icon={ShieldAlert}
                    href={suspendedQueueHref("admin")}
                  />
                ) : null}
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Role">
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
                </div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Account">
                  {status !== "suspended" ? (
                    <DataTableRowAction
                      label="Suspend account"
                      icon={Ban}
                      onClick={() => openAccount(u, "suspend")}
                    />
                  ) : null}
                  {status !== "removed" ? (
                    <DataTableRowAction
                      label="Remove account"
                      icon={UserX}
                      variant="danger"
                      onClick={() => openAccount(u, "remove")}
                    />
                  ) : null}
                  {status === "suspended" || status === "removed" ? (
                    <DataTableRowAction
                      label="Restore account"
                      icon={RotateCcw}
                      onClick={() => openAccount(u, "restore")}
                    />
                  ) : null}
                </div>
              </>
            );
          }}
        />
      )}
      </>
      ) : null}
        </TabsContent>

        <TabsContent value="sign-ins" className="mt-4 flex flex-col gap-3">
          {tab === "sign-ins" ? (
          <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-caption text-text-muted" id="sign-in-sort-label">
              Sort
            </span>
            <ToggleGroup
              value={[signInSort]}
              onValueChange={(values) => {
                const next = values[0] as SignInSort | undefined;
                if (next) setSignInSort(next);
              }}
              variant="outline"
              spacing={0}
              aria-labelledby="sign-in-sort-label"
            >
              <ToggleGroupItem value="latest">Latest</ToggleGroupItem>
              <ToggleGroupItem value="oldest">Oldest</ToggleGroupItem>
            </ToggleGroup>
            <span className="text-caption text-text-muted" id="sign-in-filter-label">
              Sign-in
            </span>
            <ToggleGroup
              value={[signInFilter]}
              onValueChange={(values) => {
                const next = values[0] as SignInFilter | undefined;
                if (next) setSignInFilter(next);
              }}
              variant="outline"
              spacing={0}
              aria-labelledby="sign-in-filter-label"
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="signed-in">Signed in</ToggleGroupItem>
              <ToggleGroupItem value="none">No sign-in recorded</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <DataTable
            columns={signInColumns}
            data={signInRows}
            loading={pending}
            getRowId={(u) => u.id}
            caption="Last sign-in"
            filterPlaceholder="Filter people…"
            itemLabel="people"
          />
          </>
          ) : null}
        </TabsContent>
      </Tabs>

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
              {accountTitle} for {accountTarget?.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Standing is currently{" "}
              {accountTarget ? standingLabel(accountTarget).toLowerCase() : ""}. The
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
              {accountAction === "restore" &&
              accountTarget &&
              suspensions.has(accountTarget.id) ? (
                <p className="text-body text-text-primary m-0 mt-2">
                  Their accreditation is also suspended. Restoring the account does not
                  reinstate it; do that separately on Accreditation.
                </p>
              ) : null}
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
              {busy ? "Saving…" : accountConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminRolesRoute() {
  return (
    <Suspense>
      <AdminRolesPage />
    </Suspense>
  );
}
