"use client";

import {
  Check,
  Clock,
  Crown,
  EllipsisVertical,
  Link2,
  Mail,
  Phone,
  QrCode,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AddStaffDialog } from "@/components/shop-team/AddStaffDialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonLines } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { toast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api/client";
import {
  approveShopMember,
  getMyShopTeam,
  removeShopMember,
  revokeShopInvite,
  setShopMemberRole,
  type ShopTeam,
} from "@/lib/api/shop-team";
import type { ShopInvite, ShopInviteKind, ShopMember } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useShopAccess } from "@/lib/auth/shop-access";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  inviteExpiresIn,
  inviteTitle,
  isLastOwner,
  openInvites,
  shopRoleLabel,
  shopTeamErrorCopy,
  teamRows,
} from "@/lib/shop-team";
import { relativeTime } from "@/app/supplier/_lib/job-activity";

const INVITE_ICON: Record<ShopInviteKind, typeof Mail> = {
  email: Mail,
  phone: Phone,
  qr: QrCode,
  link: Link2,
};

type Confirm =
  | { kind: "remove"; member: ShopMember }
  | { kind: "decline"; member: ShopMember };

/**
 * The Owner's Team page: who can use this shop's login, who is waiting to be
 * let in, and the invites still open. Staff take and make orders only; the
 * Owner keeps prices, products, hours, payouts and this page.
 */
export function TeamManager() {
  const { user } = useAuth();
  const { shop } = useShopAccess();
  const [team, setTeam] = useState<ShopTeam | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam(await getMyShopTeam());
      setLoadError(null);
    } catch (caught) {
      setLoadError(shopTeamErrorCopy(isApiError(caught) ? caught.code : null));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // Someone joining or an approval elsewhere is an `identity` ping to the shop.
  useLiveReload("identity", load);

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await action();
      toast.add({ type: "success", title: done });
    } catch (caught) {
      toast.add({
        type: "error",
        title: shopTeamErrorCopy(isApiError(caught) ? caught.code : null),
      });
    } finally {
      setBusy(null);
      await load();
    }
  }

  if (loadError && !team) {
    return (
      <ErrorState
        body={loadError}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  const members = team?.members ?? [];
  const { pending, active } = teamRows(members);
  const invites = openInvites(team?.invites ?? []);

  return (
    <div className="flex max-w-3xl flex-col gap-5" data-testid="team-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-text-secondary m-0">
          {team ? `${active.length} ${active.length === 1 ? "person" : "people"}` : " "}
        </p>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <UserRoundPlus aria-hidden />
          Add staff
        </Button>
      </div>

      {!team ? <SkeletonLines lines={5} /> : null}

      {pending.length ? (
        <section aria-labelledby="team-waiting" className="flex flex-col gap-2">
          <h2 id="team-waiting" className="text-h3 text-text-primary m-0">
            Waiting for you
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {pending.map((member) => (
              <li
                key={member.userId}
                data-testid="pending-member"
                className="flex flex-wrap items-center gap-3 rounded-card border border-warning bg-surface p-3"
              >
                <MemberAvatar name={member.name} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body text-text-primary truncate" style={{ fontFamily: "var(--font-medium)" }}>
                    {member.name}
                  </span>
                  <span className="text-caption text-text-muted">
                    Joined {member.createdAt ? relativeTime(Date.parse(member.createdAt)) : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy !== null}
                    aria-label={`Approve ${member.name}`}
                    onClick={() =>
                      void run(
                        `approve:${member.userId}`,
                        () => approveShopMember(member.userId),
                        `${member.name} can now take orders`,
                      )
                    }
                  >
                    <Check aria-hidden />
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    aria-label={`Decline ${member.name}`}
                    onClick={() => setConfirm({ kind: "decline", member })}
                  >
                    <X aria-hidden />
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {team ? (
        <section aria-labelledby="team-members" className="flex flex-col gap-2">
          <h2 id="team-members" className="text-h3 text-text-primary m-0">
            Team
          </h2>
          <ul className="m-0 flex list-none flex-col rounded-card border border-outline bg-surface p-0">
            {active.map((member) => {
              const self = member.userId === user?.id;
              const lastOwner = isLastOwner(member, members);
              return (
                <li
                  key={member.userId}
                  data-testid="team-member"
                  className="border-outline-subtle flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
                >
                  <MemberAvatar name={member.name} />
                  <span className="text-body text-text-primary min-w-0 flex-1 truncate" style={{ fontFamily: "var(--font-medium)" }}>
                    {member.name}
                    {self ? <span className="text-text-muted"> (you)</span> : null}
                  </span>
                  <StatusChip
                    tone="neutral"
                    icon={member.role === "owner" ? "award" : "store"}
                    label={shopRoleLabel(member.role)}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Options for ${member.name}`}
                          disabled={busy !== null}
                        />
                      }
                    >
                      <EllipsisVertical aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <DropdownMenuGroup>
                        {member.role === "staff" ? (
                          <DropdownMenuItem
                            className="min-h-11"
                            onClick={() =>
                              void run(
                                `role:${member.userId}`,
                                () => setShopMemberRole(member.userId, "owner"),
                                `${member.name} is now an Owner`,
                              )
                            }
                          >
                            <Crown aria-hidden />
                            Make Owner
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="min-h-11"
                            disabled={lastOwner}
                            onClick={() =>
                              void run(
                                `role:${member.userId}`,
                                () => setShopMemberRole(member.userId, "staff"),
                                `${member.name} is now Staff`,
                              )
                            }
                          >
                            <UserRound aria-hidden />
                            Make Staff
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          className="min-h-11"
                          variant="destructive"
                          disabled={lastOwner}
                          onClick={() => setConfirm({ kind: "remove", member })}
                        >
                          <X aria-hidden />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
          {active.length === 1 && !pending.length && !invites.length ? (
            <p className="text-body text-text-secondary m-0">
              Just you. Add staff to share the order work.
            </p>
          ) : null}
        </section>
      ) : null}

      {invites.length ? (
        <section aria-labelledby="team-invites" className="flex flex-col gap-2">
          <h2 id="team-invites" className="text-h3 text-text-primary m-0">
            Open invites
          </h2>
          <ul className="m-0 flex list-none flex-col rounded-card border border-outline bg-surface p-0">
            {invites.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                disabled={busy !== null}
                onCancel={() =>
                  void run(`invite:${invite.id}`, () => revokeShopInvite(invite.id), "Invite cancelled")
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      <AddStaffDialog
        open={adding}
        onOpenChange={setAdding}
        shopName={shop?.name}
        onCreated={() => void load()}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "decline"
                ? `Decline ${confirm.member.name}?`
                : `Remove ${confirm?.member.name ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "decline"
                ? "They won't get in. To add them later, send a new invite."
                : "They're signed out right away. To add them back, send a new invite."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = confirm;
                setConfirm(null);
                if (!target) return;
                void run(
                  `remove:${target.member.userId}`,
                  () => removeShopMember(target.member.userId),
                  target.kind === "decline"
                    ? `${target.member.name} declined`
                    : `${target.member.name} removed`,
                );
              }}
            >
              {confirm?.kind === "decline" ? "Decline" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemberAvatar({ name }: { name: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-variant text-caption text-text-secondary"
      style={{ fontFamily: "var(--font-bold)" }}
    >
      {initials}
    </span>
  );
}

function InviteRow({
  invite,
  disabled,
  onCancel,
}: {
  invite: ShopInvite;
  disabled: boolean;
  onCancel: () => void;
}) {
  const Icon = INVITE_ICON[invite.kind];
  return (
    <li
      data-testid="open-invite"
      className="border-outline-subtle flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-pill border border-outline-subtle text-text-secondary"
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-text-primary truncate">{inviteTitle(invite)}</span>
        <span className="text-caption text-text-muted flex items-center gap-1">
          <Clock aria-hidden className="size-3" />
          {inviteExpiresIn(invite.expiresAt)}
        </span>
      </div>
      <Button
        variant="ghost"
        disabled={disabled}
        aria-label={`Cancel invite ${inviteTitle(invite)}`}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </li>
  );
}
