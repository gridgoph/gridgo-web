"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Award, ChevronLeft, ChevronRight, Eye, Users } from "lucide-react";

import { MissionMeter } from "@/components/founding-testers/MissionProgress";
import { TesterBudgetCard } from "@/components/founding-testers/TesterRewardsList";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { isApiError, listFoundingTesters, listUsers } from "@/lib/api/client";
import type { FoundingTesterRow, TesterBudget } from "@/lib/api/types";
import {
  FOUNDING_TESTERS_PAGE_SIZE,
  neighbourPages,
  pageRangeText,
  presentTesterLabel,
  presentTesterReward,
} from "@/lib/founding-testers";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

/** `?page=` is 1-based on screen; anything unreadable is the first page. */
function offsetFromPage(page: string | null): number {
  const n = Number(page);
  return Number.isSafeInteger(n) && n > 1 ? (n - 1) * FOUNDING_TESTERS_PAGE_SIZE : 0;
}

/**
 * Every client account's five Founding Tester steps, label, reward and invite
 * counts, for Operations and Super Admin (`GET /ops/founding-testers`, 100 a
 * page), with this month's tester budget. Read-only: the API counts and
 * awards. Each row opens the client's account in the caller's tree.
 */
export function FoundingTestersList({ tree }: { tree: "ops" | "admin" }) {
  const router = useRouter();
  const params = useSearchParams();
  const offset = offsetFromPage(params.get("page"));
  const [rows, setRows] = useState<FoundingTesterRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [shownOffset, setShownOffset] = useState<number | null>(null);
  const [earned, setEarned] = useState<number | null>(null);
  const [budget, setBudget] = useState<TesterBudget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [page, testers] = await Promise.all([
          listFoundingTesters({ offset, limit: FOUNDING_TESTERS_PAGE_SIZE }),
          // The headline count only; the page still reads without it.
          listUsers("client", { foundingTester: true }).catch(() => null),
        ]);
        setRows(page.clients);
        setTotal(page.total);
        setShownOffset(offset);
        setBudget(page.budget ?? null);
        setEarned(testers ? testers.length : null);
      } catch (err) {
        setRows(null);
        setError(
          isApiError(err)
            ? err.status === 403
              ? "Only Operations and Super Admin can read Founding Tester progress."
              : opsErrorMessage(err, "Could not load Founding Tester progress. Retry.")
            : "Could not reach the API. Check the connection, then retry.",
        );
      } finally {
        setLoading(false);
      }
    }, [offset]),
  );

  useLiveReload(["identity", "notifications"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const goTo = useCallback(
    (nextOffset: number) => {
      const page = Math.floor(nextOffset / FOUNDING_TESTERS_PAGE_SIZE) + 1;
      router.push(`/${tree}/founding-testers${page > 1 ? `?page=${page}` : ""}`);
    },
    [router, tree],
  );

  const columns = useMemo<DataTableColumn<FoundingTesterRow>[]>(
    () => [
      {
        id: "client",
        header: "Client",
        primary: true,
        sortValue: (row) => row.name,
        filterValue: (row) => row.name,
        cell: (row) => (
          <span
            className="text-body text-text-primary"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {row.name || "Unnamed client"}
          </span>
        ),
      },
      {
        id: "progress",
        header: "Steps",
        sortValue: (row) => row.foundingTester.completedCount,
        cell: (row) => <MissionMeter progress={row.foundingTester} />,
      },
      {
        id: "label",
        header: "Label",
        sortValue: (row) => presentTesterLabel(row.foundingTester).label,
        filterValue: (row) => presentTesterLabel(row.foundingTester).label,
        cell: (row) => {
          const label = presentTesterLabel(row.foundingTester);
          return <StatusChip tone={label.tone} label={label.label} icon={label.icon} />;
        },
      },
      {
        id: "invites",
        header: "Invites",
        sortValue: (row) => row.invites?.invited ?? 0,
        cell: (row) =>
          row.invites ? (
            <span
              className="text-body text-text-primary tabular-nums whitespace-normal"
              aria-label={`${row.invites.invited} invited, ${row.invites.joined} joined, ${row.invites.completed} completed`}
            >
              {row.invites.invited} invited · {row.invites.joined} joined ·{" "}
              {row.invites.completed} completed
            </span>
          ) : (
            <span className="text-caption text-text-muted">—</span>
          ),
      },
      {
        id: "reward",
        header: "Reward",
        sortValue: (row) => presentTesterReward(row.foundingTester).label,
        cell: (row) => {
          const reward = presentTesterReward(row.foundingTester);
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <StatusChip tone={reward.tone} label={reward.label} icon={reward.icon} />
              <span className="text-caption text-text-muted line-clamp-2 max-w-72 whitespace-normal">
                {reward.detail}
              </span>
            </div>
          );
        },
      },
    ],
    [],
  );

  const pending = loading && !rows;
  if (!pending && error && !rows) {
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

  const pages = neighbourPages(shownOffset ?? offset, total ?? 0);
  const range =
    rows && total != null
      ? pageRangeText(shownOffset ?? offset, rows.length, total)
      : null;
  const stale = shownOffset !== offset;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Client accounts"
          value={total != null ? total.toLocaleString("en-PH") : "—"}
          hint="Every client, eligible or not"
          icon={Users}
          loading={pending}
        />
        <StatCard
          label="Founding Testers"
          value={earned != null ? earned.toLocaleString("en-PH") : "—"}
          hint="Clients who earned the label"
          icon={Award}
          loading={pending}
        />
        <TesterBudgetCard budget={budget} loading={pending} />
      </div>

      {!pending && rows && !rows.length && (total ?? 0) === 0 ? (
        <EmptyState
          title="No client accounts yet"
          body="A client appears here as soon as they sign up in the GRIDGO app."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : !pending && rows && !rows.length ? (
        <EmptyState
          title="Nothing on this page"
          body="There are fewer clients than this page starts at."
          action={
            <Button variant="secondary" onClick={() => goTo(0)}>
              First page
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows ?? []}
          loading={pending || stale}
          getRowId={(row) => row.clientId}
          caption="Founding Tester progress"
          filterPlaceholder="Filter this page…"
          itemLabel="clients"
          pageSize={FOUNDING_TESTERS_PAGE_SIZE}
          rowActionsDensity="labeled"
          rowActions={(row) => (
            <DataTableRowAction
              label="Open client account"
              icon={Eye}
              href={`/${tree}/founding-testers/${encodeURIComponent(row.clientId)}`}
            />
          )}
        />
      )}

      {error && rows ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      {range || pages.previous != null || pages.next != null ? (
        <nav
          aria-label="Founding Tester pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span className="text-caption text-text-muted tabular-nums" role="status">
            {range}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={loading || pages.previous == null}
              onClick={() => pages.previous != null && goTo(pages.previous)}
            >
              <ChevronLeft aria-hidden />
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={loading || pages.next == null}
              onClick={() => pages.next != null && goTo(pages.next)}
            >
              Next
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
