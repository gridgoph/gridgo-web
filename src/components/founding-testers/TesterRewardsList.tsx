"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Play, Wallet, XCircle } from "lucide-react";

import {
  RewardActionDialog,
  type RewardAction,
} from "@/components/founding-testers/RewardActionDialog";
import {
  RewardCheckChips,
  RewardCheckCoverage,
} from "@/components/founding-testers/RewardChecks";
import { personLabel, usePeople } from "@/components/vouchers/data";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  isApiError,
  listTesterRewards,
  resumeTesterReward,
  voidTesterReward,
} from "@/lib/api/client";
import type { TesterBudget, TesterReward, TesterRewardStatus } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  REWARD_FILTERS,
  TESTER_LIST_PAGE_SIZE,
  presentBudget,
  presentRewardState,
  rewardActions,
  rewardAmountText,
  rewardKindText,
  testerErrorText,
} from "@/lib/tester-program";
import { formatManila } from "@/lib/vouchers";

/** This month's tester budget as a stat card. */
export function TesterBudgetCard({
  budget,
  loading,
}: {
  budget: TesterBudget | null | undefined;
  loading?: boolean;
}) {
  const shown = budget ? presentBudget(budget) : null;
  return (
    <StatCard
      label="Tester vouchers this month"
      value={shown ? shown.value : "—"}
      hint={shown ? shown.hint : "Not available yet."}
      icon={Wallet}
      loading={loading}
    />
  );
}

/**
 * Founding Tester rewards (`GET /ops/tester-rewards`): each mission and invite
 * reward with its state, what it pays, and for an invite reward which checks
 * ran and whose evidence was missing. Super Admin (`tree="admin"`) can void an
 * issued or paused reward and resume a paused one, each confirmed with a
 * reason; Operations reads the same list with no actions.
 */
export function TesterRewardsList({
  tree,
  clientId,
}: {
  tree: "ops" | "admin";
  /** Only rewards where this account is the friend, owner or inviter. */
  clientId?: string;
}) {
  const canAct = tree === "admin";
  const { people } = usePeople("clients");
  const name = useCallback((id: string) => personLabel(people, id), [people]);
  const [filter, setFilter] = useState<TesterRewardStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [rewards, setRewards] = useState<TesterReward[] | null>(null);
  const [total, setTotal] = useState(0);
  const [budget, setBudget] = useState<TesterBudget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<TesterReward | null>(null);
  const [acting, setActing] = useState<{
    reward: TesterReward;
    action: RewardAction;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const page = await listTesterRewards(
          { status: filter === "all" ? undefined : filter, clientId },
          { offset, limit: TESTER_LIST_PAGE_SIZE },
        );
        setRewards(page.rewards);
        setTotal(page.total);
        setBudget(page.budget);
      } catch (err) {
        setRewards(null);
        setError(
          isApiError(err)
            ? err.status === 403
              ? "Only Operations and Super Admin can read tester rewards."
              : err.status === 404
                ? "Tester rewards are not available yet. They appear here once the service is updated."
                : `Could not load tester rewards (${err.code}).`
            : "Could not reach the API. Check it is running, then retry.",
        );
      } finally {
        setLoading(false);
      }
    }, [filter, clientId, offset]),
  );

  useLiveReload(["identity", "notifications"], load);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(reason: string) {
    if (!acting) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const run = acting.action === "void" ? voidTesterReward : resumeTesterReward;
      const result = await run(acting.reward.id, reason);
      setBudget(result.budget);
      setRewards((rows) =>
        rows
          ? rows.map((row) => (row.id === result.reward.id ? result.reward : row))
          : rows,
      );
      setActionOk(
        acting.action === "void"
          ? "Reward voided."
          : result.reward.status === "issued"
            ? "Reward resumed and issued."
            : result.reward.status === "blocked"
              ? "Resumed, but an invite check now matches: the reward is blocked."
              : "Still paused: the monthly budget has no room for it yet.",
      );
      setActing(null);
      void load();
    } catch (err) {
      setActionError(
        testerErrorText(err) ??
          (isApiError(err)
            ? `Could not ${acting.action} this reward (${err.code}).`
            : "Could not reach the API. Try again."),
      );
      if (
        isApiError(err) &&
        ["tester_reward_not_found", "tester_reward_not_paused"].includes(err.code)
      ) {
        void load();
      }
    } finally {
      setActionBusy(false);
    }
  }

  const who = useCallback(
    (reward: TesterReward) =>
      reward.kind === "referral" && reward.inviterId
        ? `${name(reward.clientId)}, invited by ${name(reward.inviterId)}`
        : name(reward.clientId),
    [name],
  );

  const columns = useMemo<DataTableColumn<TesterReward>[]>(
    () => [
      {
        id: "who",
        header: "Client",
        primary: true,
        sortValue: (row) => name(row.clientId),
        filterValue: (row) =>
          `${name(row.clientId)} ${row.inviterId ? name(row.inviterId) : ""}`,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span
              className="text-body text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {name(row.clientId)}
            </span>
            {row.inviterId ? (
              <span className="text-caption text-text-muted">
                Invited by {name(row.inviterId)}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "kind",
        header: "Reward",
        sortValue: (row) => rewardKindText(row),
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="text-body text-text-primary">{rewardKindText(row)}</span>
            <span className="text-caption text-text-muted">{rewardAmountText(row)}</span>
          </div>
        ),
      },
      {
        id: "state",
        header: "State",
        sortValue: (row) => presentRewardState(row).label,
        cell: (row) => {
          const state = presentRewardState(row);
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <StatusChip tone={state.tone} label={state.label} icon={state.icon} />
              <span className="text-caption text-text-muted line-clamp-3 max-w-80 whitespace-normal">
                {state.detail}
              </span>
            </div>
          );
        },
      },
      {
        id: "checks",
        header: "Invite checks",
        cell: (row) => <RewardCheckChips reward={row} />,
      },
      {
        id: "created",
        header: "Earned",
        hideOnMobile: true,
        sortValue: (row) => row.createdAt,
        cell: (row) => (
          <span className="text-body text-text-secondary">
            {formatManila(row.createdAt)}
          </span>
        ),
      },
    ],
    [name],
  );

  const pending = loading && !rewards;
  if (!pending && error && !rewards) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const previous = offset > 0 ? Math.max(0, offset - TESTER_LIST_PAGE_SIZE) : null;
  const next =
    offset + TESTER_LIST_PAGE_SIZE < total ? offset + TESTER_LIST_PAGE_SIZE : null;

  return (
    <div className="flex flex-col gap-3">
      {clientId ? null : (
        <div className="grid gap-3 md:max-w-md">
          <TesterBudgetCard budget={budget} loading={pending} />
        </div>
      )}
      {canAct ? null : (
        <p className="text-caption text-text-muted m-0">
          Only Super Admin can void or resume a reward.
        </p>
      )}

      <ToggleGroup
        value={[filter]}
        onValueChange={(values) => {
          const value = values[0] as TesterRewardStatus | "all" | undefined;
          if (value) {
            setFilter(value);
            setOffset(0);
          }
        }}
        variant="outline"
        spacing={0}
        aria-label="Show rewards"
        className="flex-wrap"
      >
        {REWARD_FILTERS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="min-h-11 px-3"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}

      {!pending && rewards && !rewards.length ? (
        <EmptyState
          title={filter === "all" ? "No tester rewards yet" : "No rewards in this state"}
          body={
            filter === "all"
              ? "A reward appears here when a client finishes all five steps, or a friend they invited does."
              : "Pick another state to see the rest."
          }
          action={
            filter === "all" ? undefined : (
              <Button variant="secondary" onClick={() => setFilter("all")}>
                Show all
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rewards ?? []}
          loading={pending}
          getRowId={(row) => row.id}
          caption="Founding Tester rewards"
          filterPlaceholder="Filter by name…"
          itemLabel="rewards"
          pageSize={TESTER_LIST_PAGE_SIZE}
          rowActionsDensity="labeled"
          rowActions={(row) => {
            const allowed = rewardActions(row);
            return (
              <>
                <DataTableRowAction
                  label="Review checks"
                  icon={Eye}
                  onClick={() => setReviewing(row)}
                />
                {canAct && allowed.canResume ? (
                  <DataTableRowAction
                    label="Resume"
                    icon={Play}
                    onClick={() => {
                      setActionError(null);
                      setActionOk(null);
                      setActing({ reward: row, action: "resume" });
                    }}
                  />
                ) : null}
                {canAct && allowed.canVoid ? (
                  <DataTableRowAction
                    label="Void"
                    icon={XCircle}
                    onClick={() => {
                      setActionError(null);
                      setActionOk(null);
                      setActing({ reward: row, action: "void" });
                    }}
                  />
                ) : null}
              </>
            );
          }}
        />
      )}

      {error && rewards ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      {previous != null || next != null ? (
        <nav
          aria-label="Reward pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span className="text-caption text-text-muted tabular-nums" role="status">
            Rewards {offset + 1}–{offset + (rewards?.length ?? 0)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={loading || previous == null}
              onClick={() => previous != null && setOffset(previous)}
            >
              <ChevronLeft aria-hidden />
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={loading || next == null}
              onClick={() => next != null && setOffset(next)}
            >
              Next
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </nav>
      ) : null}

      <Dialog
        open={reviewing !== null}
        onOpenChange={(open) => !open && setReviewing(null)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          {reviewing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {rewardKindText(reviewing)} reward: {name(reviewing.clientId)}
                </DialogTitle>
                <DialogDescription>
                  {reviewing.inviterId ? `Invited by ${name(reviewing.inviterId)}. ` : ""}
                  {rewardAmountText(reviewing)}. Earned{" "}
                  {formatManila(reviewing.createdAt)}.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-start gap-1">
                <StatusChip
                  tone={presentRewardState(reviewing).tone}
                  label={presentRewardState(reviewing).label}
                  icon={presentRewardState(reviewing).icon}
                />
                <p className="text-body text-text-secondary m-0">
                  {presentRewardState(reviewing).detail}
                </p>
              </div>
              <RewardCheckCoverage reward={reviewing} name={name} />
              {reviewing.kind === "referral" ? (
                <p className="text-caption text-text-muted m-0">
                  Only a match blocks a reward. Missing evidence is neither a match nor a
                  pass, so the reward still issues; void it if the coverage is not enough.
                </p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <RewardActionDialog
        target={acting}
        who={acting ? who(acting.reward) : ""}
        busy={actionBusy}
        error={actionError}
        onCancel={() => {
          setActing(null);
          setActionError(null);
        }}
        onConfirm={(reason) => void act(reason)}
      />
    </div>
  );
}
