"use client";

import { UserRoundX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import { SkeletonLines } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { toast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api/client";
import { getOpsShopTeam, removeOpsShopMember } from "@/lib/api/shop-team";
import type { ShopMember } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { isLastOwner, shopRoleLabel, shopTeamErrorCopy } from "@/lib/shop-team";

const STATUS_CHIP: Record<ShopMember["status"], { tone: StatusTone; icon: StatusIconName; label: string }> = {
  active: { tone: "success", icon: "circle-check", label: "Active" },
  pending: { tone: "warning", icon: "clock", label: "Waiting for Owner" },
  removed: { tone: "neutral", icon: "ban", label: "Removed" },
};

const ORDER: Record<ShopMember["status"], number> = { active: 0, pending: 1, removed: 2 };

/**
 * A shop's logins as Operations sees them (`GET /ops/shops/:shopId/team`):
 * name, Owner or Staff, and standing. Operations can end anyone's access
 * except the last active Owner; it cannot invite, approve or promote.
 */
export function OpsShopTeam({ shopId }: { shopId: string }) {
  const [members, setMembers] = useState<ShopMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<ShopMember | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await getOpsShopTeam(shopId));
      setError(null);
    } catch (caught) {
      // An API without shop teams answers 404: nothing to show.
      if (isApiError(caught) && caught.code === "shop_not_found") setMembers([]);
      else setError("The team could not be loaded.");
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(member: ShopMember) {
    setBusy(true);
    try {
      await removeOpsShopMember(shopId, member.userId);
      toast.add({ type: "success", title: `${member.name}'s access removed` });
    } catch (caught) {
      toast.add({ type: "error", title: shopTeamErrorCopy(isApiError(caught) ? caught.code : null) });
    } finally {
      setBusy(false);
      setTarget(null);
      await load();
    }
  }

  const rows = [...(members ?? [])].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1),
  );

  return (
    <section aria-labelledby="shop-team-heading" className="flex flex-col gap-3" data-testid="ops-shop-team">
      <h3 id="shop-team-heading" className="text-h3 text-text-primary m-0">
        Team
      </h3>
      {error ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-body text-error m-0">{error}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : members === null ? (
        <SkeletonLines lines={2} />
      ) : rows.length === 0 ? (
        <p className="text-body text-text-secondary m-0">No team logins.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col rounded-card border border-outline p-0">
          {rows.map((member) => {
            const chip = STATUS_CHIP[member.status];
            const lastOwner = isLastOwner(member, rows);
            return (
              <li
                key={member.userId}
                data-testid="ops-team-member"
                className="border-outline-subtle flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 last:border-b-0"
              >
                <span className="text-body text-text-primary min-w-0 flex-1 truncate" style={{ fontFamily: "var(--font-medium)" }}>
                  {member.name}
                </span>
                <span className="text-caption text-text-secondary">{shopRoleLabel(member.role)}</span>
                <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
                {member.status !== "removed" ? (
                  <Button
                    variant="ghost"
                    disabled={busy || lastOwner}
                    title={lastOwner ? "The last Owner keeps access" : undefined}
                    aria-label={`Remove ${member.name}'s access`}
                    onClick={() => setTarget(member)}
                  >
                    <UserRoundX aria-hidden />
                    Remove
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <AlertDialog open={target !== null} onOpenChange={(next) => !next && !busy && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {target?.name}&rsquo;s access?</AlertDialogTitle>
            <AlertDialogDescription>
              They are signed out of this shop on the app and web right away. Only the shop&rsquo;s
              Owner can invite them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={busy}>
              Keep
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => target && void remove(target)}
            >
              {busy ? "Removing…" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
