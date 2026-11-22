"use client";

import {
  Check,
  Clock,
  KeyRound,
  Link2,
  Mail,
  Monitor,
  Phone,
  QrCode,
  Send,
  UserRoundPlus,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddStaffDialog, type AddStaffMethod } from "@/components/shop-team/AddStaffDialog";
import { PersonPanel, personRights } from "@/components/shop-team/PersonPanel";
import { AddPinStaffDialog, NewPinDialog } from "@/components/shop-team/PinStaffDialogs";
import { TeamAvatar } from "@/components/shop-team/TeamAvatar";
import { enterSharedPc } from "@/components/shop-device/enterSharedPc";
import { SharedPcCleanupError } from "@/lib/pwa/webPush";
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
import { SkeletonLines } from "@/components/ui/loading";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api/client";
import {
  approveShopMember,
  getMyShopTeam,
  removePinStaff,
  removeShopMember,
  revokeShopInvite,
  setMyTeamAlerts,
  setShopMemberAlerts,
  setShopMemberRole,
  updatePinStaff,
  updateShopTeamSettings,
  type ShopTeam,
} from "@/lib/api/shop-team";
import type { ShopInvite, ShopInviteKind, ShopRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useShopAccess } from "@/lib/auth/shop-access";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  inviteExpiresIn,
  inviteTitle,
  isFastest,
  missionLine,
  missionPercent,
  openInvites,
  personLine,
  rosterOf,
  shopRoleLabel,
  shopTeamErrorCopy,
  teamPeople,
  type TeamPerson,
} from "@/lib/shop-team";
import { useSupplierDesktop } from "@/lib/useSupplierDesktop";
import { cn } from "@/lib/utils";

const INVITE_ICON: Record<ShopInviteKind, typeof Mail> = {
  email: Mail,
  phone: Phone,
  qr: QrCode,
  link: Link2,
};

type Confirm = { kind: "remove"; person: TeamPerson } | { kind: "shared-pc" };

/**
 * The Team page (gridgoph/gridgo-web#328, the phone's Team screen): the shop
 * card with its Owners and Managers, people waiting to join, the Staff grid,
 * the positive week (fastest this week and the team mission), open invites
 * and the shared shop PC. Click a person for their panel: beside the roster
 * at 1280px and wider, a sheet below it.
 *
 * Owners and Managers add and manage people; Staff see the positive view
 * only. PIN people, the shared PC and the week show only when this GRIDGO
 * sends them, so an older API never leads to a refusal.
 */
/** Why "Share this PC" stopped. The PC stays yours; pressing it again retries. */
export function sharedPcErrorCopy(caught: unknown): string {
  if (caught instanceof SharedPcCleanupError) {
    return caught.step === "gridgo"
      ? "Could not stop GRIDGO sending your alerts to this PC. Check the connection and share it again."
      : "Could not turn off your alerts on this PC. Share it again, or turn them off in the browser first.";
  }
  if (isApiError(caught)) return shopTeamErrorCopy(caught.code);
  return "Could not reach GRIDGO. Check the connection and share it again.";
}

export function TeamManager() {
  const { user } = useAuth();
  const access = useShopAccess();
  const { can, role, worker } = access;
  const desktop = useSupplierDesktop();
  const [team, setTeam] = useState<ShopTeam | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteMethod, setInviteMethod] = useState<AddStaffMethod | null>(null);
  const [addingPin, setAddingPin] = useState(false);
  const [newPinFor, setNewPinFor] = useState<TeamPerson | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Only the newest read lands. A read started under another role or another
  // person at the keyboard (a demotion, a switch on the shared PC) is dropped,
  // so a Manager's answer with everyone's speed never shows to Staff.
  const viewKey = `${user?.id ?? ""}|${role}|${worker?.pinStaffId ?? ""}`;
  const latestRead = useRef(0);
  const load = useCallback(async () => {
    const read = ++latestRead.current;
    try {
      const next = await getMyShopTeam();
      if (read !== latestRead.current) return;
      setTeam(next);
      setLoadError(null);
    } catch (caught) {
      if (read !== latestRead.current) return;
      setLoadError(shopTeamErrorCopy(isApiError(caught) ? caught.code : null));
    }
  }, []);

  useEffect(() => {
    // A new viewer starts from nothing: what the last one could see goes.
    setTeam(null);
    setSelectedKey(null);
    setLoadError(null);
    void load();
  }, [load, viewKey]);
  // Someone joining or an approval elsewhere is an `identity` ping to the shop.
  useLiveReload("identity", load);

  const people = useMemo(
    () => teamPeople(team?.members ?? [], team?.pinStaff ?? null),
    [team],
  );
  const { leads, staff, pending } = rosterOf(people);
  const selected = people.find((p) => p.key === selectedKey) ?? null;
  const ownerCount = people.filter((p) => p.role === "owner" && p.status === "active").length;
  const pinOffered = team?.pinStaff != null;
  const pinPeople = staff.filter((p) => p.kind === "pin").length + leads.filter((p) => p.kind === "pin").length;
  const onShift = people.filter((p) => p.onShift).length;
  const invites = can.manageTeam ? openInvites(team?.invites ?? []) : [];

  function isSelf(person: TeamPerson): boolean {
    if (worker) return person.kind === "pin" && person.id === worker.pinStaffId;
    return person.kind === "account" && person.id === user?.id;
  }

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

  function changeRole(person: TeamPerson, next: ShopRole) {
    void run(
      `role:${person.key}`,
      () =>
        person.kind === "pin"
          ? updatePinStaff(person.id, { role: next === "manager" ? "manager" : "staff" })
          : setShopMemberRole(person.id, next),
      `${person.name} is now ${shopRoleLabel(next)}`,
    );
  }

  function changeAlerts(person: TeamPerson, on: boolean) {
    const action = isSelf(person)
      ? () => setMyTeamAlerts(on)
      : person.kind === "pin"
        ? () => updatePinStaff(person.id, { jobAlerts: on })
        : () => setShopMemberAlerts(person.id, on);
    void run(
      `alerts:${person.key}`,
      action,
      on ? `${person.name} gets job alerts` : `No job alerts for ${person.name}`,
    );
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

  const panel = selected ? (
    <PersonPanel
      person={selected}
      self={isSelf(selected)}
      rights={personRights(
        role,
        selected,
        isSelf(selected),
        selected.role === "owner" && ownerCount <= 1,
      )}
      stats={team?.stats ?? null}
      showSpeed={can.personStats}
      busy={busy !== null}
      onRole={(next) => changeRole(selected, next)}
      onAlerts={(on) => changeAlerts(selected, on)}
      onNewPin={() => setNewPinFor(selected)}
      onRemove={() => setConfirm({ kind: "remove", person: selected })}
    />
  ) : null;

  const face = (person: TeamPerson) => {
    const fastest = isFastest(person, team?.stats ?? null);
    return (
      <li key={person.key}>
        <button
          type="button"
          data-testid="team-person"
          aria-pressed={selectedKey === person.key}
          onClick={() => setSelectedKey(person.key)}
          className={cn(
            "flex w-28 flex-col items-center gap-1 rounded-card border border-transparent p-2 text-center",
            "hover:bg-overlay-hover",
            selectedKey === person.key && "border-outline bg-surface",
          )}
        >
          <TeamAvatar name={person.name} size="md" onShift={person.onShift} />
          <span
            className="text-body text-text-primary w-full truncate"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {person.name}
            {isSelf(person) ? " (you)" : ""}
          </span>
          <span className="text-caption text-text-muted">
            {person.role === "staff" ? personLine(person) : shopRoleLabel(person.role)}
          </span>
          {fastest ? (
            <span className="text-caption text-text-primary flex items-center gap-1">
              <Zap aria-hidden className="size-3" />
              Fastest
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  const fastest = team?.stats?.fastestThisWeek ?? null;
  // Per-person speed is for Owners and Managers, whatever an answer carries.
  const fastestStats = fastest && can.personStats
    ? team?.stats?.members?.find((row) =>
        fastest.pinStaffId ? row.pinStaffId === fastest.pinStaffId : row.userId === fastest.userId,
      )
    : null;
  const mission = team?.stats?.mission ?? null;

  const roster = (
    <div className="flex min-w-0 flex-col gap-5">
      <section
        aria-labelledby="team-shop"
        className="flex flex-col gap-4 rounded-card border border-outline bg-surface p-4 md:p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="team-shop" className="text-h2 text-text-primary m-0 flex-1">
            {access.shop?.name ? `${access.shop.name} team` : "Your team"}
          </h2>
          {can.manageTeam ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setInviteMethod("qr")}>
                <QrCode aria-hidden />
                Show QR
              </Button>
              <Button variant="outline" onClick={() => setInviteMethod("link")}>
                <Send aria-hidden />
                Send link
              </Button>
              {pinOffered ? (
                <Button variant="primary" onClick={() => setAddingPin(true)}>
                  <KeyRound aria-hidden />
                  Add with PIN
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setInviteMethod("contact")}>
                  <UserRoundPlus aria-hidden />
                  Add staff
                </Button>
              )}
            </div>
          ) : null}
        </div>
        {!team ? <SkeletonLines lines={2} /> : null}
        {leads.length ? (
          <ul aria-label="Owners and managers" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {leads.map(face)}
          </ul>
        ) : null}
        {can.manageTeam && pinOffered ? (
          <button
            type="button"
            className="text-caption text-text-secondary self-start underline"
            onClick={() => setInviteMethod("contact")}
          >
            Or invite by email or mobile number
          </button>
        ) : null}
      </section>

      {can.manageTeam && pending.length ? (
        <section aria-labelledby="team-waiting" className="flex flex-col gap-2">
          <h2 id="team-waiting" className="text-h3 text-text-primary m-0">
            Wants to join
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {pending.map((person) => (
              <li
                key={person.key}
                data-testid="pending-member"
                className="flex flex-wrap items-center gap-3 rounded-card border border-warning bg-surface p-3"
              >
                <TeamAvatar name={person.name} />
                <span className="text-body text-text-primary min-w-0 flex-1 truncate">{person.name}</span>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  aria-label={`Approve ${person.name}`}
                  onClick={() =>
                    void run(
                      `approve:${person.key}`,
                      () => approveShopMember(person.id),
                      `${person.name} can now take orders`,
                    )
                  }
                >
                  <Check aria-hidden />
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy !== null}
                  aria-label={`Decline ${person.name}`}
                  onClick={() => setConfirm({ kind: "remove", person })}
                >
                  <X aria-hidden />
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {team ? (
        <section aria-labelledby="team-staff" className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <h2 id="team-staff" className="text-h3 text-text-primary m-0 flex-1">
              Staff · {staff.length}
            </h2>
            {onShift ? <span className="text-caption text-text-secondary">{onShift} on shift</span> : null}
          </div>
          {staff.length ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{staff.map(face)}</ul>
          ) : (
            <p className="text-body text-text-secondary m-0">
              {can.manageTeam
                ? "No staff yet. Add someone to share the order work."
                : "No other staff yet."}
            </p>
          )}
        </section>
      ) : null}

      {fastest || mission ? (
        <section aria-label="This week" className="grid gap-3 md:grid-cols-2">
          {fastest ? (
            <div className="flex items-center gap-3 rounded-card bg-text-primary p-4 text-surface">
              <Zap aria-hidden className="size-6 shrink-0" />
              <div className="flex min-w-0 flex-col">
                <span style={{ fontFamily: "var(--font-bold)" }}>Fastest this week: {fastest.name}</span>
                {fastestStats ? (
                  <span className="text-caption opacity-80">
                    {[
                      fastestStats.averageAcceptSeconds != null
                        ? `Accepts in ${fastestStats.averageAcceptSeconds} sec on average`
                        : null,
                      `${fastestStats.jobsThisWeek} jobs`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {mission ? (
            <div className="flex flex-col gap-2 rounded-card border border-outline bg-surface p-4">
              <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-bold)" }}>
                Team mission
              </span>
              <span className="text-caption text-text-secondary">{missionLine(mission)}</span>
              <Progress value={missionPercent(mission)} aria-label="Team mission progress" />
            </div>
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

      {can.manageTeam && pinOffered && !worker ? (
        <section
          aria-labelledby="team-shared-pc"
          className="flex flex-wrap items-center gap-3 rounded-card border border-outline bg-surface p-4"
        >
          <Monitor aria-hidden className="size-6 shrink-0 text-text-secondary" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id="team-shared-pc" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
              Use this PC for PIN staff
            </h2>
            <p className="text-caption text-text-muted m-0">
              {pinPeople
                ? "Staff pick their face and type their PIN. It locks after 15 minutes without use."
                : "Add someone with a PIN first."}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={!pinPeople || busy !== null}
            onClick={() => setConfirm({ kind: "shared-pc" })}
          >
            Share this PC
          </Button>
        </section>
      ) : null}

      {can.ownerSettings && team?.settings ? (
        <section className="flex items-center gap-3 rounded-card border border-outline bg-surface p-4">
          <label htmlFor="team-ranking" className="flex min-w-0 flex-1 flex-col">
            <span className="text-body text-text-primary">Show the fastest badge to staff</span>
            <span className="text-caption text-text-muted">
              Staff always see the team mission. Speeds are only for you and managers.
            </span>
          </label>
          <Switch
            id="team-ranking"
            checked={team.settings.showRankingToStaff}
            disabled={busy !== null}
            onCheckedChange={(next) =>
              void run(
                "settings",
                () => updateShopTeamSettings({ showRankingToStaff: Boolean(next) }),
                next ? "Staff see who was fastest" : "Fastest badge hidden from staff",
              )
            }
          />
        </section>
      ) : null}
    </div>
  );

  return (
    <div data-testid="team-manager" data-layout={desktop ? "desktop" : "phone"}>
      {desktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_23.75rem] items-start gap-4">
          {roster}
          <aside
            aria-label="Person"
            className="sticky top-[4.25rem] rounded-card border border-outline bg-surface p-4"
          >
            {panel ?? (
              <p className="text-body text-text-secondary m-0">
                {can.manageTeam
                  ? "Pick someone to see their week and change their settings."
                  : "Pick someone to see their role and job alerts."}
              </p>
            )}
          </aside>
        </div>
      ) : (
        <>
          {roster}
          <Sheet open={selected !== null} onOpenChange={(next) => !next && setSelectedKey(null)}>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto p-4">
              <SheetHeader className="sr-only">
                <SheetTitle>{selected?.name ?? "Person"}</SheetTitle>
              </SheetHeader>
              {panel}
            </SheetContent>
          </Sheet>
        </>
      )}

      <AddStaffDialog
        open={inviteMethod !== null}
        onOpenChange={(next) => !next && setInviteMethod(null)}
        initialMethod={inviteMethod ?? "contact"}
        shopName={access.shop?.name}
        onCreated={() => void load()}
      />
      <AddPinStaffDialog
        open={addingPin}
        onOpenChange={setAddingPin}
        canGrantManager={can.ownerSettings}
        onAdded={(name) => {
          toast.add({ type: "success", title: `${name} can now work by PIN` });
          void load();
        }}
      />
      <NewPinDialog
        person={newPinFor}
        onOpenChange={(next) => !next && setNewPinFor(null)}
        onDone={(name) => {
          toast.add({ type: "success", title: `${name} has a new PIN` });
          void load();
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "shared-pc"
                ? "Share this PC with PIN staff?"
                : confirm?.person.status === "pending"
                  ? `Decline ${confirm.person.name}?`
                  : `Remove ${confirm?.person.name ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "shared-pc"
                ? "This PC shows “Who’s working?” and only work screens. Your Money, settings and alerts close here. To get them back on this PC, sign out and sign in again."
                : confirm?.person.status === "pending"
                  ? "They won't get in. To add them later, send a new invite."
                  : confirm?.person.kind === "pin"
                    ? "Their PIN stops working at once. To add them back, add them again."
                    : "They're signed out right away. To add them back, send a new invite."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "shared-pc" ? "secondary" : "destructive"}
              onClick={() => {
                const target = confirm;
                setConfirm(null);
                if (!target) return;
                if (target.kind === "shared-pc") {
                  void enterSharedPc().catch((caught) =>
                    toast.add({
                      type: "error",
                      title: sharedPcErrorCopy(caught),
                    }),
                  );
                  return;
                }
                const person = target.person;
                setSelectedKey(null);
                void run(
                  `remove:${person.key}`,
                  () => (person.kind === "pin" ? removePinStaff(person.id) : removeShopMember(person.id)),
                  person.status === "pending" ? `${person.name} declined` : `${person.name} removed`,
                );
              }}
            >
              {confirm?.kind === "shared-pc"
                ? "Share this PC"
                : confirm?.person.status === "pending"
                  ? "Decline"
                  : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
