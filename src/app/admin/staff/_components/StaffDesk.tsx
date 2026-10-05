"use client";

/**
 * Staff, Super Admin only (gridgoph/gridgo-api#125). Invite a person to the
 * GRIDGO Admin App with a role, see who joined and every staff member's hub
 * handovers, revoke unused invites, and reassign or suspend staff.
 *
 * The invite code is the one secret on this page: it is shown once, right
 * after creating the invite, and never again. Rules: `../../_lib/staff.ts`.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Plus,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";

import {
  INVITE_DAYS_DEFAULT,
  INVITE_DAYS_MAX,
  INVITE_DAYS_MIN,
  INVITE_STATE,
  inviteDaysProblem,
  inviteState,
  roleCodeFromName,
  roleName,
  roleProblem,
  sortInvites,
} from "@/app/admin/_lib/staff";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
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
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  createStaffInvite,
  createStaffRole,
  isApiError,
  listHubHandouts,
  listStaff,
  listStaffInvites,
  listStaffRoles,
  revokeStaffInvite,
  updateStaffMember,
} from "@/lib/api/client";
import type {
  HubStaffTotal,
  StaffInvite,
  StaffInviteCreated,
  StaffMember,
  StaffRole,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Data = {
  roles: StaffRole[];
  invites: StaffInvite[];
  staff: StaffMember[];
  /** `null` when the handover log could not be read: counts are unknown, never zero. */
  handovers: Map<string, number> | null;
};

type Pending =
  | { kind: "revoke"; invite: StaffInvite }
  | { kind: "suspend" | "restore"; member: StaffMember };

export function StaffDesk() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<StaffInviteCreated | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [roles, invites, staff, log] = await Promise.all([
          listStaffRoles(),
          listStaffInvites(),
          listStaff(),
          listHubHandouts({ limit: 1 }).catch(() => null),
        ]);
        setData({
          roles,
          invites,
          staff,
          handovers: log
            ? new Map(
                log.staffTotals.map((row: HubStaffTotal) => [row.staffId, row.count]),
              )
            : null,
        });
      } catch (err) {
        setError(
          opsErrorMessage(err, "Staff could not be loaded. Retry when the API responds."),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );
  useLiveReload(["identity", "orders"], load);
  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(
    () =>
      new Map((data?.staff ?? []).map((member) => [member.userId, member.name ?? ""])),
    [data],
  );

  async function confirmPending() {
    if (!pending || !data) return;
    setBusy(true);
    setActionError(null);
    try {
      if (pending.kind === "revoke") {
        await revokeStaffInvite(pending.invite.id);
        setNotice(
          `Invite for ${roleName(data.roles, pending.invite.roleCode)} revoked. The code no longer works.`,
        );
      } else {
        const active = pending.kind === "restore";
        await updateStaffMember(pending.member.userId, {
          roleCode: pending.member.roleCode,
          active,
        });
        const who = pending.member.name || "This staff member";
        setNotice(
          active
            ? `${who} can use the Admin App again.`
            : `${who} is suspended from the Admin App.`,
        );
      }
      setPending(null);
      await load();
    } catch (err) {
      setActionError(staffErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: StaffMember, roleCode: string) {
    setActionError(null);
    setNotice(null);
    try {
      await updateStaffMember(member.userId, { roleCode, active: member.active });
      setNotice(
        `${member.name || "This staff member"} is now ${roleName(data?.roles ?? [], roleCode)}.`,
      );
      await load();
    } catch (err) {
      setActionError(staffErrorMessage(err));
    }
  }

  if (loading && !data) return <SkeletonLines lines={8} />;
  if (!data) {
    return (
      <ErrorState
        body={error ?? "Staff could not be loaded."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const invites = sortInvites(data.invites);
  const memberColumns: DataTableColumn<StaffMember>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      alwaysVisible: true,
      sortValue: (row) => row.name ?? "",
      cell: (row) => <span style={medium}>{row.name || "Name not on record"}</span>,
    },
    {
      id: "role",
      header: "Role",
      sortValue: (row) => roleName(data.roles, row.roleCode),
      cell: (row) => (
        <RoleSelect
          roles={data.roles}
          value={row.roleCode}
          label={`Role for ${row.name || "this staff member"}`}
          onChange={(code) => void changeRole(row, code)}
        />
      ),
    },
    {
      id: "standing",
      header: "Access",
      sortValue: (row) => (row.active ? "active" : "suspended"),
      cell: (row) =>
        row.active ? (
          <StatusChip tone="success" label="Active" icon="circle-check" />
        ) : (
          <StatusChip tone="error" label="Suspended" icon="ban" />
        ),
    },
    {
      id: "handovers",
      header: "Hub handovers",
      sortValue: (row) => data.handovers?.get(row.userId) ?? 0,
      cell: (row) =>
        data.handovers ? (
          <span className="tabular-nums">{data.handovers.get(row.userId) ?? 0}</span>
        ) : (
          <span className="text-text-muted">Unknown</span>
        ),
    },
    {
      id: "updated",
      header: "Last change",
      sortValue: (row) => row.updatedAt,
      cell: (row) => formatDateTime(row.updatedAt),
    },
  ];

  const inviteColumns: DataTableColumn<StaffInvite>[] = [
    {
      id: "role",
      header: "Role",
      primary: true,
      alwaysVisible: true,
      sortValue: (row) => roleName(data.roles, row.roleCode),
      cell: (row) => <span style={medium}>{roleName(data.roles, row.roleCode)}</span>,
    },
    {
      id: "state",
      header: "Status",
      sortValue: (row) => INVITE_STATE[inviteState(row)].label,
      cell: (row) => {
        const state = INVITE_STATE[inviteState(row)];
        const who = row.redeemedBy ? names.get(row.redeemedBy) : null;
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusChip tone={state.tone} label={state.label} icon={state.icon} />
            {row.redeemedAt ? (
              <span className="text-caption text-text-secondary">
                {who ? `By ${who}, ` : ""}
                {formatDateTime(row.redeemedAt)}
              </span>
            ) : row.revokedAt ? (
              <span className="text-caption text-text-secondary">
                {formatDateTime(row.revokedAt)}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "created",
      header: "Created",
      sortValue: (row) => row.createdAt,
      cell: (row) => formatDateTime(row.createdAt),
    },
    {
      id: "expires",
      header: "Expires",
      sortValue: (row) => row.expiresAt,
      cell: (row) => formatDateTime(row.expiresAt),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Staff use the GRIDGO Admin App to scan pick-up QR codes at the hub. Each person
        joins with a one-time invite code and signs in with their own GRIDGO account. A
        role decides whether they may hand out orders; no staff role reaches Operations or
        Super Admin.
      </p>

      {notice ? (
        <p className="text-body text-success m-0" role="status">
          {notice}
        </p>
      ) : null}
      {actionError && !pending ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <InviteForm
          roles={data.roles}
          created={created}
          onCreated={(result) => {
            setCreated(result);
            setNotice(null);
            void load();
          }}
          onDismissCode={() => setCreated(null)}
        />
        <RolesCard roles={data.roles} onCreated={() => void load()} />
      </div>

      <section aria-labelledby="staff-members" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="staff-members" className="text-h3 text-text-primary m-0">
            Staff members ({data.staff.length})
          </h2>
          <Link
            href="/admin/hub"
            className="text-body text-text-secondary underline underline-offset-2"
          >
            Every handover on the hub log
          </Link>
        </div>
        <DataTable
          caption="Staff members"
          columns={memberColumns}
          data={data.staff}
          getRowId={(row) => row.userId}
          itemLabel="staff"
          defaultSortId="name"
          rowActionsDensity="labeled"
          rowActions={(row) =>
            row.active ? (
              <DataTableRowAction
                label="Suspend"
                icon={UserRoundX}
                variant="danger"
                onClick={() => {
                  setActionError(null);
                  setPending({ kind: "suspend", member: row });
                }}
              />
            ) : (
              <DataTableRowAction
                label="Restore"
                icon={UserRoundCheck}
                onClick={() => {
                  setActionError(null);
                  setPending({ kind: "restore", member: row });
                }}
              />
            )
          }
          empty={
            <EmptyState
              title="No staff yet"
              body="Create an invite above and send the code to the person privately. They show up here once they use it."
            />
          }
        />
      </section>

      <section aria-labelledby="staff-invites" className="flex flex-col gap-2">
        <h2 id="staff-invites" className="text-h3 text-text-primary m-0">
          Invites ({invites.length})
        </h2>
        <DataTable
          caption="Staff invites"
          columns={inviteColumns}
          data={invites}
          getRowId={(row) => row.id}
          itemLabel="invites"
          rowActionsDensity="labeled"
          rowActions={(row) =>
            inviteState(row) === "waiting" ? (
              <DataTableRowAction
                label="Revoke"
                icon={Ban}
                variant="danger"
                onClick={() => {
                  setActionError(null);
                  setPending({ kind: "revoke", invite: row });
                }}
              />
            ) : null
          }
          empty={
            <EmptyState
              title="No invites yet"
              body="Every invite you create is listed here with when it expires and who used it. The code itself is never shown again."
            />
          }
        />
      </section>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !busy && setPending(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingTitle(pending, data.roles)}</AlertDialogTitle>
            <AlertDialogDescription>{pendingConsequence(pending)}</AlertDialogDescription>
          </AlertDialogHeader>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={pending?.kind === "restore" ? "primary" : "danger"}
              disabled={busy}
              onClick={() => void confirmPending()}
            >
              {busy
                ? "Saving…"
                : pending?.kind === "revoke"
                  ? "Revoke invite"
                  : pending?.kind === "suspend"
                    ? "Suspend"
                    : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InviteForm({
  roles,
  created,
  onCreated,
  onDismissCode,
}: {
  roles: readonly StaffRole[];
  created: StaffInviteCreated | null;
  onCreated: (result: StaffInviteCreated) => void;
  onDismissCode: () => void;
}) {
  const [roleCode, setRoleCode] = useState(
    roles.some((role) => role.code === "hub_staff")
      ? "hub_staff"
      : (roles[0]?.code ?? ""),
  );
  const [days, setDays] = useState(String(INVITE_DAYS_DEFAULT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const daysProblem = inviteDaysProblem(days);

  async function submit() {
    if (!roleCode || daysProblem) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await createStaffInvite({ roleCode, expiresInDays: Number(days) }));
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="invite-heading" className="gg-card flex flex-col gap-3 p-3">
      <h2 id="invite-heading" className="text-h3 text-text-primary m-0">
        Invite a staff member
      </h2>
      {created ? (
        <InviteCode created={created} roles={roles} onDone={onDismissCode} />
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <RoleSelect
                id="invite-role"
                roles={roles}
                value={roleCode}
                onChange={setRoleCode}
              />
              <FieldDescription>
                {roles.find((role) => role.code === roleCode)?.canHandout
                  ? "Can hand out hub orders after a matching QR and code."
                  : "Cannot hand out hub orders."}
              </FieldDescription>
            </Field>
            <Field data-invalid={daysProblem ? true : undefined}>
              <FieldLabel htmlFor="invite-days">Code works for (days)</FieldLabel>
              <Input
                id="invite-days"
                type="number"
                inputMode="numeric"
                min={INVITE_DAYS_MIN}
                max={INVITE_DAYS_MAX}
                className="max-w-32"
                value={days}
                aria-invalid={daysProblem ? true : undefined}
                onChange={(event) => setDays(event.target.value)}
              />
              {daysProblem ? <FieldError>{daysProblem}</FieldError> : null}
            </Field>
          </FieldGroup>
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !roleCode || Boolean(daysProblem)}
            >
              <KeyRound className="size-4" aria-hidden />
              {busy ? "Creating…" : "Create invite code"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * The code, once. Large and wrapping, so it can be read aloud or copied whole
 * on a phone; a copy button beside it. Leaving this view forgets it.
 */
function InviteCode({
  created,
  roles,
  onDone,
}: {
  created: StaffInviteCreated;
  roles: readonly StaffRole[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-primary m-0">
        Send this code privately to the person joining as{" "}
        <span style={medium}>{roleName(roles, created.invite.roleCode)}</span>. It works
        once, until {formatDateTime(created.invite.expiresAt)}.
      </p>
      <div className="rounded-field border-2 border-foreground p-3">
        <p
          className="text-body-lg text-text-primary m-0 break-all select-all tracking-wide"
          style={medium}
          aria-label="Invite code"
        >
          {created.code}
        </p>
      </div>
      <p className="text-caption text-warning m-0">
        This is the only time the code is shown. GRIDGO keeps no readable copy.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void copy()}>
          {copied === "yes" ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied === "yes" ? "Copied" : "Copy code"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Done, create another
        </Button>
      </div>
      {copied === "failed" ? (
        <p className="text-caption text-error m-0" role="alert">
          The browser blocked copying. Select the code and copy it by hand.
        </p>
      ) : null}
      <p className="text-caption text-text-muted m-0">
        They open the GRIDGO Admin App, sign in with their own account, and enter the
        code.
      </p>
    </div>
  );
}

function RolesCard({
  roles,
  onCreated,
}: {
  roles: readonly StaffRole[];
  onCreated: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [canHandout, setCanHandout] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = roleProblem(name, roles);

  async function submit() {
    setTouched(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await createStaffRole({
        code: roleCodeFromName(name),
        name: name.trim(),
        canHandout,
      });
      setAdding(false);
      setName("");
      setCanHandout(false);
      setTouched(false);
      onCreated();
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="roles-heading" className="gg-card flex flex-col gap-3 p-3">
      <h2 id="roles-heading" className="text-h3 text-text-primary m-0">
        Roles
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {roles.map((role) => (
          <li
            key={role.code}
            className="flex flex-wrap items-baseline justify-between gap-2"
          >
            <span className="text-body text-text-primary" style={medium}>
              {role.name}
            </span>
            <span className="text-caption text-text-secondary">
              {role.canHandout ? "Hands out hub orders" : "Does not hand out orders"}
            </span>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="flex flex-col gap-3 border-t border-outline-subtle pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={touched && problem ? true : undefined}>
              <FieldLabel htmlFor="role-name">Role name</FieldLabel>
              <Input
                id="role-name"
                value={name}
                aria-invalid={touched && problem ? true : undefined}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Front desk"
              />
              {touched && problem ? <FieldError>{problem}</FieldError> : null}
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="role-handout"
                checked={canHandout}
                onCheckedChange={(value) => setCanHandout(value === true)}
              />
              <FieldLabel htmlFor="role-handout">May hand out hub orders</FieldLabel>
            </Field>
          </FieldGroup>
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
          <p className="text-caption text-text-muted m-0">
            A role cannot be renamed or removed once created.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={busy}>
              {busy ? "Adding…" : "Add role"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            Add a role
          </Button>
        </div>
      )}
    </section>
  );
}

function RoleSelect({
  id,
  roles,
  value,
  label,
  onChange,
}: {
  id?: string;
  roles: readonly StaffRole[];
  value: string;
  label?: string;
  onChange: (code: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => next && next !== value && onChange(String(next))}
    >
      <SelectTrigger id={id} aria-label={label} className="min-h-11 w-full min-w-40">
        <SelectValue>{(code) => roleName(roles, String(code ?? ""))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.code} value={role.code}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function pendingTitle(pending: Pending | null, roles: readonly StaffRole[]): string {
  if (!pending) return "";
  if (pending.kind === "revoke")
    return `Revoke this ${roleName(roles, pending.invite.roleCode)} invite?`;
  const who = pending.member.name || "this staff member";
  return pending.kind === "suspend" ? `Suspend ${who}?` : `Restore ${who}?`;
}

function pendingConsequence(pending: Pending | null): string {
  if (!pending) return "";
  if (pending.kind === "revoke")
    return "The code stops working. It cannot be turned back on; create a new invite if they still need one.";
  if (pending.kind === "suspend")
    return "They are refused on their next action in the Admin App, including scanning. Their past handovers stay on the log.";
  return "They can use the Admin App again with their current role.";
}

function staffErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case "invalid_staff_role":
        return "That role no longer exists. Refresh and choose another.";
      case "invalid_invite_expiry":
        return `Choose ${INVITE_DAYS_MIN} to ${INVITE_DAYS_MAX} days.`;
      case "staff_role_exists":
        return "A role with this name already exists.";
      case "staff_invite_not_found":
        return "That invite no longer exists. Refresh the list.";
      case "staff_not_found":
        return "That staff member no longer exists. Refresh the list.";
      case "invalid_staff_profile":
        return "That change was refused. Refresh and try again.";
    }
    if (err.kind === "forbidden") return "Only Super Admin manages staff.";
  }
  return opsErrorMessage(err, "That did not go through. Try again.");
}
