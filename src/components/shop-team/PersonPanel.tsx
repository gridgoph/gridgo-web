"use client";

import { KeyRound, UserMinus, Zap } from "lucide-react";
import { useId } from "react";

import { TeamAvatar } from "@/components/shop-team/TeamAvatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ShopRole, ShopTeamStats } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  acceptTimeLabel,
  isFastest,
  shopRoleLabel,
  statsFor,
  type TeamPerson,
} from "@/lib/shop-team";

/** What the viewer may do to this person. Mirrors the API's team rules. */
export type PersonRights = {
  /** Staff ⇄ Manager (⇄ Owner for an account). Owner only, never yourself. */
  changeRole: boolean;
  /** Job alerts: yourself through `/me`, others as Owner, or Staff as Manager. */
  changeAlerts: boolean;
  newPin: boolean;
  remove: boolean;
};

/**
 * Owners change anyone but themselves; Managers change Staff only, never
 * themselves or another Manager; Staff change nothing but their own alerts.
 * The last Owner is never removed or demoted (`409 last_shop_owner`).
 */
export function personRights(
  viewer: ShopRole,
  person: TeamPerson,
  self: boolean,
  lastOwner: boolean,
): PersonRights {
  const active = person.status === "active";
  if (self) return { changeRole: false, changeAlerts: active, newPin: false, remove: false };
  const owner = viewer === "owner";
  const managesThem = owner || (viewer === "manager" && person.role === "staff");
  return {
    changeRole: owner && active && !lastOwner,
    changeAlerts: managesThem && active,
    newPin: managesThem && active && person.kind === "pin",
    remove: managesThem && !lastOwner,
  };
}

/** The roles an Owner can give this person: PIN people are never Owners. */
export function roleChoices(person: TeamPerson): ShopRole[] {
  return person.kind === "pin" ? ["staff", "manager"] : ["staff", "manager", "owner"];
}

/**
 * One person: who they are, their role, job alerts, their week (to Owners and
 * Managers only, as the API sends it) and the actions the viewer may take.
 */
export function PersonPanel({
  person,
  self,
  rights,
  stats,
  busy,
  onRole,
  onAlerts,
  onNewPin,
  onRemove,
}: {
  person: TeamPerson;
  self: boolean;
  rights: PersonRights;
  stats: ShopTeamStats | null;
  busy: boolean;
  onRole: (role: ShopRole) => void;
  onAlerts: (on: boolean) => void;
  onNewPin: () => void;
  onRemove: () => void;
}) {
  const id = useId();
  const week = statsFor(person, stats);
  const fastest = isFastest(person, stats);
  const avg = acceptTimeLabel(week?.averageAcceptSeconds);
  const how = person.kind === "pin" ? "PIN on the shop PC" : "Own login";
  const joined = person.createdAt ? `joined ${formatDate(person.createdAt)}` : null;

  return (
    <div className="flex flex-col gap-4" data-testid="person-panel">
      <div className="flex items-center gap-3">
        <TeamAvatar name={person.name} size="md" onShift={person.onShift} />
        <div className="flex min-w-0 flex-col">
          <h2 className="text-h3 text-text-primary m-0 truncate">
            {person.name}
            {self ? <span className="text-text-muted"> (you)</span> : null}
          </h2>
          <p className="text-caption text-text-muted m-0">
            {[shopRoleLabel(person.role), how, joined].filter(Boolean).join(" · ")}
          </p>
          {fastest ? (
            <p className="text-caption text-text-primary m-0 flex items-center gap-1">
              <Zap aria-hidden className="size-3" />
              Fastest this week
            </p>
          ) : null}
        </div>
      </div>

      {rights.changeRole ? (
        <div className="flex flex-col gap-2">
          <ToggleGroup
            aria-label={`Role for ${person.name}`}
            value={[person.role]}
            disabled={busy}
            onValueChange={(value: string[]) => {
              const next = value[0] as ShopRole | undefined;
              if (next && next !== person.role) onRole(next);
            }}
          >
            {roleChoices(person).map((role) => (
              <ToggleGroupItem key={role} value={role} variant="outline">
                {shopRoleLabel(role)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-caption text-text-muted m-0">
            A Manager can also change hours, products and staff. Only an Owner sees Money.
          </p>
        </div>
      ) : null}

      {person.status === "active" ? (
        <div className="flex items-center gap-3 border-t border-outline-subtle pt-3">
          <label htmlFor={`${id}-alerts`} className="text-body text-text-primary flex-1">
            Gets job alerts
          </label>
          <Switch
            id={`${id}-alerts`}
            checked={person.jobAlerts}
            disabled={busy || !rights.changeAlerts}
            onCheckedChange={(next) => onAlerts(Boolean(next))}
          />
        </div>
      ) : null}

      {week ? (
        <dl className="m-0 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 rounded-field bg-surface-variant p-3">
            <dt className="text-caption text-text-muted">Jobs this week</dt>
            <dd className="text-h3 text-text-primary m-0">{week.jobsThisWeek}</dd>
          </div>
          <div className="flex flex-col gap-1 rounded-field bg-surface-variant p-3">
            <dt className="text-caption text-text-muted">Average time to accept</dt>
            <dd className="text-h3 text-text-primary m-0">{avg ?? "Not measured yet"}</dd>
          </div>
        </dl>
      ) : null}

      {rights.newPin || rights.remove ? (
        <div className="flex flex-col gap-2 border-t border-outline-subtle pt-3">
          {rights.newPin ? (
            <Button variant="secondary" disabled={busy} onClick={onNewPin}>
              <KeyRound aria-hidden />
              Give a new PIN
            </Button>
          ) : null}
          {rights.remove ? (
            <Button variant="destructive" disabled={busy} onClick={onRemove}>
              <UserMinus aria-hidden />
              {person.status === "pending" ? "Decline" : "Remove from shop"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
