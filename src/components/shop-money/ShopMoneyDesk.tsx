"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShopMoneyPanel } from "@/components/shop-money/ShopMoneyPanel";
import { getShopMoneyDesk, listUsers, requestShopMoneyRun } from "@/lib/api/client";
import type { ShopMoneyDesk as Desk, ShopMoneyRun, ShopMoneyShopRow, ShopMoneyTransfer } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  activeBalances,
  balanceStatus,
  clockWords,
  heldSummary,
  isTodaysRun,
  latestRun,
  manilaLocalInput,
  manilaWhenWords,
  netWords,
  openTransfers,
  paidSinceRun,
  RUN_LANES,
  runDateWords,
  runRows,
  runTotals,
  shopMoneyErrorMessage,
  shopMoneyUnavailable,
  TRANSFER_STATE,
  transferStatusOf,
  type RunRow,
} from "@/lib/shop-money";

const VIEWS = [
  { id: "run", label: "Daily run" },
  { id: "transfers", label: "Transfers" },
  { id: "balances", label: "Balances" },
] as const;
type View = (typeof VIEWS)[number]["id"];

type DeskState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; desk: Desk };

const medium = { fontFamily: "var(--font-medium)" } as const;

/**
 * Shop money (gridgo-api#416): each shop's two running balances, the 4 PM
 * business-day run, and the one combined transfer each shop is sent. The run
 * is a review list; a transfer is prepared (frozen), sent outside GRIDGO once,
 * then recorded with its receipt. Mounted at `/ops/shop-money` and
 * `/admin/shop-money`; Super Admin alone also gets the per-shop counter-cash
 * switch and may reconcile anyone's transfer.
 */
export function ShopMoneyDesk({ base, superAdmin }: { base: "/ops" | "/admin"; superAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const view: View = (VIEWS.find((v) => v.id === search.get("view"))?.id as View | undefined) ?? "run";
  const selectedId = search.get("shop");

  const [state, setState] = useState<DeskState>({ kind: "loading" });
  const [names, setNames] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const namesRead = useRef(false);

  const setParams = useCallback(
    (next: { view?: View; shop?: string | null }) => {
      const params = new URLSearchParams(search.toString());
      if (next.view !== undefined) {
        if (next.view === "run") params.delete("view");
        else params.set("view", next.view);
      }
      if (next.shop !== undefined) {
        if (next.shop) params.set("shop", next.shop);
        else params.delete("shop");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, search],
  );

  const load = useSerializedLoad(
    useCallback(async () => {
      // Names are a nicety: a failed read leaves "Shop …" and is tried again next refresh.
      if (!namesRead.current) {
        listUsers("supplier").then(
          (users) => {
            namesRead.current = true;
            setNames(Object.fromEntries(users.map((u) => [u.id, u.supplierName || u.name])));
          },
          () => {},
        );
      }
      try {
        setState({ kind: "ready", desk: await getShopMoneyDesk() });
      } catch (err) {
        if (shopMoneyUnavailable(err)) setState({ kind: "unavailable" });
        else setState({ kind: "failed", message: shopMoneyErrorMessage(err, "Could not load shop money.") });
      }
    }, []),
  );
  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(["payouts", "availability"], load);

  const desk = state.kind === "ready" ? state.desk : null;
  const nameOf = useCallback(
    (supplierId: string, transfer?: ShopMoneyTransfer | null) =>
      names[supplierId] || transfer?.data.payoutAccount.shopName || `Shop ${supplierId.slice(-6)}`,
    [names],
  );

  async function getTodaysRun() {
    if (runBusy) return;
    setRunBusy(true);
    setRunMessage(null);
    try {
      const run = await requestShopMoneyRun();
      setRunMessage(
        run
          ? null
          : "No run is due yet: runs start at the payout time on a business day. The next one is shown above.",
      );
      await load();
    } catch (err) {
      setRunMessage(shopMoneyErrorMessage(err, "Could not get today's run. Try again."));
    } finally {
      setRunBusy(false);
    }
  }

  if (state.kind === "unavailable") {
    return (
      <EmptyState
        title="Shop money is not on this server yet"
        body="Once GRIDGO's server offers daily shop payouts, the run, each shop's balances and Pay GRIDGO show here."
      />
    );
  }

  const showPanel = Boolean(selectedId);
  const run = desk ? latestRun(desk) : null;
  const open = desk ? openTransfers(desk.transfers) : [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Shops earn around the clock. At the payout time on each business day GRIDGO works out what
        every shop can be paid. Prepare a shop to freeze its amount and receiving QR, send it from the
        wallet once, then record it with the receipt.
      </p>

      <Tabs value={view} onValueChange={(value) => setParams({ view: value as View, shop: null })}>
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v.id} value={v.id}>
              {v.label}
              {v.id === "transfers" && open.length ? (
                <span className="tabular-nums"> ({open.length})</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {notice ? (
        <p className="text-body text-text-primary m-0" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-4">
        <section aria-label="Shops" className={`flex min-w-0 flex-col gap-2 ${showPanel ? "max-lg:hidden" : ""}`}>
          {state.kind === "loading" ? (
            <SkeletonCards count={3} label="Loading shop money" />
          ) : state.kind === "failed" ? (
            <ErrorState
              body={state.message}
              action={
                <Button variant="secondary" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          ) : desk && view === "run" ? (
            <RunList
              desk={desk}
              run={run}
              selectedId={selectedId}
              nameOf={nameOf}
              runBusy={runBusy}
              runMessage={runMessage}
              onGetRun={() => void getTodaysRun()}
              onOpen={(id) => {
                setNotice(null);
                setParams({ shop: id });
              }}
            />
          ) : desk && view === "transfers" ? (
            <TransferList
              transfers={desk.transfers}
              selectedId={selectedId}
              nameOf={nameOf}
              onOpen={(id) => {
                setNotice(null);
                setParams({ shop: id });
              }}
            />
          ) : desk ? (
            <BalanceList
              rows={desk.shops}
              selectedId={selectedId}
              nameOf={nameOf}
              onOpen={(id) => {
                setNotice(null);
                setParams({ shop: id });
              }}
            />
          ) : null}
        </section>

        <section aria-label="Shop" className={`min-w-0 ${showPanel ? "" : "max-lg:hidden"}`}>
          {showPanel ? (
            <Button variant="ghost" className="mb-2 lg:hidden" onClick={() => setParams({ shop: null })}>
              <ArrowLeft className="size-4" aria-hidden />
              All shops
            </Button>
          ) : null}
          {!selectedId || !desk ? (
            <div className="gg-card text-body text-text-secondary p-6">
              {open.length
                ? `${open.length === 1 ? "1 transfer is" : `${open.length} transfers are`} prepared or unknown. Open a shop to record what happened.`
                : "Choose a shop to see its balances, its transfer and anything it owes GRIDGO."}
            </div>
          ) : (
            <ShopMoneyPanel
              key={selectedId}
              supplierId={selectedId}
              shopName={nameOf(selectedId, desk.transfers.find((t) => t.supplierId === selectedId))}
              desk={desk}
              base={base}
              superAdmin={superAdmin}
              onChanged={async (message) => {
                setNotice(message);
                await load();
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily run
// ---------------------------------------------------------------------------

function RunList({
  desk,
  run,
  selectedId,
  nameOf,
  runBusy,
  runMessage,
  onGetRun,
  onOpen,
}: {
  desk: Desk;
  run: ShopMoneyRun | null;
  selectedId: string | null;
  nameOf: (id: string, t?: ShopMoneyTransfer | null) => string;
  runBusy: boolean;
  runMessage: string | null;
  onGetRun: () => void;
  onOpen: (id: string) => void;
}) {
  const rows = useMemo(() => (run ? runRows(run, desk.transfers, desk.shops) : []), [run, desk.transfers, desk.shops]);
  const totals = runTotals(rows);
  const today = run ? isTodaysRun(run) : false;
  const nextPayoutAt = desk.shops.find((s) => s.nextPayoutAt)?.nextPayoutAt ?? null;
  // Before today's cutoff there is nothing to ask for: say when it starts instead.
  const nextRunIsToday = Boolean(
    nextPayoutAt && manilaLocalInput(Date.parse(nextPayoutAt)).slice(0, 10) === manilaLocalInput().slice(0, 10),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="gg-card flex flex-col gap-2 p-4" data-testid="run-header">
        {run ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-h3 text-text-primary m-0">{today ? "Today's run" : "Latest run"}</h2>
              <span className="text-caption text-text-muted">
                {runDateWords(run.data.date)}, {clockWords(run.data.payoutTime)}
              </span>
            </div>
            <p className="text-body text-text-primary m-0 tabular-nums" style={medium}>
              {totals.toSend
                ? `${formatPhp(totals.toSendMinor)} to prepare for ${totals.toSend} ${totals.toSend === 1 ? "shop" : "shops"}`
                : totals.inFlight
                  ? "Everything due is prepared. Record each transfer once it is sent."
                  : "Nothing left to prepare in this run."}
            </p>
            <p className="text-caption text-text-secondary m-0">
              Minimum {formatPhp(run.data.minimumMinor)}; smaller amounts roll over.
              {totals.inFlight ? ` ${totals.inFlight} prepared or unknown.` : ""}
              {totals.done ? ` ${totals.done} recorded.` : ""}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-h3 text-text-primary m-0">No run yet</h2>
            <p className="text-body text-text-secondary m-0">
              The first run is worked out at the payout time on a business day.
            </p>
          </>
        )}
        {!today ? (
          <div className="flex flex-col gap-1 pt-1">
            {nextRunIsToday ? (
              <p className="text-caption text-text-secondary m-0">
                Today&rsquo;s run starts {manilaWhenWords(nextPayoutAt)}. GRIDGO starts it on its own.
              </p>
            ) : (
              <>
                <p className="text-caption text-text-secondary m-0">
                  Next payout: {nextPayoutAt ? manilaWhenWords(nextPayoutAt) : "not scheduled"}. GRIDGO starts
                  each run on its own; if today&rsquo;s is late, get it now.
                </p>
                <div>
                  <Button variant="secondary" disabled={runBusy} onClick={onGetRun}>
                    {runBusy ? "Checking…" : "Get today's run"}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
        {runMessage ? (
          <p className="text-caption text-text-secondary m-0" role="status">
            {runMessage}
          </p>
        ) : null}
      </div>

      {run && rows.length === 0 ? (
        <EmptyState title="No shop has money in this run" body="Shops show here once they have pay earned, held or rolling over." />
      ) : null}

      {RUN_LANES.map(({ lane, title }) => {
        const laneRows = rows.filter((r) => r.lane === lane);
        if (!laneRows.length) return null;
        return (
          <div key={lane} className="flex flex-col gap-2">
            <h3 className="text-caption text-text-muted m-0 pt-1">
              {title} <span className="tabular-nums">({laneRows.length})</span>
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {laneRows.map((row) => (
                <li key={row.shop.supplierId}>
                  <RunRowCard row={row} name={nameOf(row.shop.supplierId, row.transfer)} selected={row.shop.supplierId === selectedId} onOpen={() => onOpen(row.shop.supplierId)} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function RunRowCard({ row, name, selected, onOpen }: { row: RunRow; name: string; selected: boolean; onOpen: () => void }) {
  const { shop, status, transfer } = row;
  const state = status ? TRANSFER_STATE[status] : null;
  const amount =
    transfer && status
      ? transfer.data.netAmountMinor
      : row.lane === "rolled_over"
        ? shop.rolloverMinor
        : row.lane === "owes" || paidSinceRun(row)
          ? -shop.netMinor
          : shop.amountMinor;
  const holds = heldSummary(shop.held);
  return (
    <RowButton
      name={name}
      selected={selected}
      onOpen={onOpen}
      amount={row.lane === "held" ? null : row.lane === "owes" || paidSinceRun(row) ? `${formatPhp(amount)} to GRIDGO` : formatPhp(amount)}
    >
      {state ? (
        <StatusChip tone={state.tone} icon={state.icon} label={state.label} />
      ) : row.lane === "to_send" ? (
        <StatusChip tone="info" icon="clock" label={shop.amountMinor === 0 ? "Settle from debt" : "Ready to prepare"} />
      ) : paidSinceRun(row) ? (
        <StatusChip tone="success" icon="circle-check" label="Paid GRIDGO" />
      ) : row.lane === "owes" ? (
        <StatusChip tone={shop.paused ? "error" : "warning"} icon="triangle-alert" label={shop.paused ? "New orders paused" : "Pay GRIDGO"} />
      ) : row.lane === "rolled_over" ? (
        <StatusChip tone="neutral" icon="circle-dashed" label="Rolls over" />
      ) : (
        <StatusChip tone="neutral" icon="ban" label="Held" />
      )}
      {holds.length ? (
        <span className="text-caption text-text-muted">
          {holds
            .slice(0, 2)
            .map((h) => (h.count > 1 ? `${h.label} (${h.count})` : h.label))
            .join("; ")}
          {holds.length > 2 ? "; more" : ""}
        </span>
      ) : null}
    </RowButton>
  );
}

function RowButton({
  name,
  amount,
  selected,
  onOpen,
  children,
}: {
  name: string;
  amount: string | null;
  selected: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      aria-label={`Open ${name}`}
      className={`gg-card hover:bg-overlay-hover flex w-full flex-col gap-2 p-3 text-left ${selected ? "border-text-primary border-2" : ""}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-body text-text-primary min-w-0 truncate" style={medium}>
          {name}
        </span>
        {amount ? (
          <span className="text-body text-text-primary shrink-0 tabular-nums" style={medium}>
            {amount}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-center gap-2">{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

function TransferList({
  transfers,
  selectedId,
  nameOf,
  onOpen,
}: {
  transfers: ShopMoneyTransfer[];
  selectedId: string | null;
  nameOf: (id: string, t?: ShopMoneyTransfer | null) => string;
  onOpen: (id: string) => void;
}) {
  const open = openTransfers(transfers);
  const recorded = transfers
    .filter((t) => !open.includes(t))
    .sort((a, b) => b.at.localeCompare(a.at));
  if (!transfers.length)
    return <EmptyState title="No transfer prepared yet" body="A transfer shows here once someone prepares a shop from the daily run." />;
  const card = (t: ShopMoneyTransfer) => {
    const state = TRANSFER_STATE[transferStatusOf(t)];
    return (
      <li key={t.id}>
        <RowButton name={nameOf(t.supplierId, t)} amount={formatPhp(t.data.netAmountMinor)} selected={t.supplierId === selectedId} onOpen={() => onOpen(t.supplierId)}>
          <StatusChip tone={state.tone} icon={state.icon} label={state.label} />
          <span className="text-caption text-text-muted">Prepared {manilaWhenWords(t.at)}</span>
        </RowButton>
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-caption text-text-muted m-0">
        Needs recording <span className="tabular-nums">({open.length})</span>
      </h3>
      {open.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{open.map(card)}</ul>
      ) : (
        <p className="text-body text-text-secondary m-0">Every prepared transfer is recorded.</p>
      )}
      {recorded.length ? (
        <>
          <h3 className="text-caption text-text-muted m-0 pt-2">Recorded</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">{recorded.map(card)}</ul>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

function BalanceList({
  rows,
  selectedId,
  nameOf,
  onOpen,
}: {
  rows: ShopMoneyShopRow[];
  selectedId: string | null;
  nameOf: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const active = activeBalances(rows);
  const q = query.trim().toLowerCase();
  const shown = q ? active.filter((r) => nameOf(r.supplierId).toLowerCase().includes(q)) : active;
  const owed = active.reduce((n, r) => n + r.owedMinor, 0);
  const owing = active.reduce((n, r) => n + r.owingMinor, 0);
  if (!active.length)
    return <EmptyState title="No shop has a balance yet" body="A shop shows here from its first paid job." />;
  return (
    <div className="flex flex-col gap-2">
      <dl className="gg-card m-0 grid grid-cols-2 gap-3 p-4">
        <div>
          <dt className="text-caption text-text-muted">GRIDGO owes shops</dt>
          <dd className="text-body text-text-primary m-0 tabular-nums" style={medium}>
            {formatPhp(owed)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Shops owe GRIDGO</dt>
          <dd className="text-body text-text-primary m-0 tabular-nums" style={medium}>
            {formatPhp(owing)}
          </dd>
        </div>
      </dl>
      <label className="sr-only" htmlFor="shop-money-search">
        Find a shop
      </label>
      <input
        id="shop-money-search"
        type="search"
        value={query}
        placeholder="Find a shop"
        onChange={(e) => setQuery(e.target.value)}
        className="border-outline bg-surface text-body text-text-primary min-h-11 rounded-field border px-3"
      />
      {shown.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {shown.map((r) => {
            const s = balanceStatus(r);
            return (
              <li key={r.supplierId}>
                <RowButton name={nameOf(r.supplierId)} amount={netWords(r.netMinor)} selected={r.supplierId === selectedId} onOpen={() => onOpen(r.supplierId)}>
                  <StatusChip tone={s.tone} icon={s.icon} label={s.label} />
                  <span className="text-caption text-text-muted tabular-nums">Paid out {formatPhp(r.paidMinor)}</span>
                </RowButton>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0">No shop matches &ldquo;{query}&rdquo;.</p>
      )}
    </div>
  );
}
