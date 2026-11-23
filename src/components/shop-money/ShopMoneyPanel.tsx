"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ConfirmPayGridgoDialog,
  FrozenDestination,
  PrepareTransferDialog,
  RecordTransferDialog,
  TransferOutcomeDialog,
} from "@/components/shop-money/TransferDialogs";
import { getShopMoneyShop, updateShopMoneyPolicy } from "@/lib/api/client";
import type {
  ShopMoneyDesk,
  ShopMoneyItem,
  ShopMoneyRunShop,
  ShopMoneyShop,
  ShopMoneyTransfer,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatPhp } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  balanceStatus,
  canActOnTransfer,
  heldSummary,
  isOffsetTransfer,
  itemLabel,
  latestRun,
  ledgerLine,
  ledgerRows,
  manilaWhenWords,
  netWords,
  PAYMENT_METHOD_LABEL,
  recoveredMinor,
  runRows,
  shopMoneyErrorMessage,
  TRANSFER_STATE,
  transferOpen,
  transferStatusOf,
} from "@/lib/shop-money";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Loaded =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; shop: ShopMoneyShop };

export function ShopMoneyPanel({
  supplierId,
  shopName,
  desk,
  base,
  superAdmin,
  onChanged,
}: {
  supplierId: string;
  shopName: string;
  desk: ShopMoneyDesk;
  base: "/ops" | "/admin";
  superAdmin: boolean;
  onChanged: (message: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      setLoaded({ kind: "ready", shop: await getShopMoneyShop(supplierId, { period }) });
    } catch (err) {
      setLoaded({ kind: "failed", message: shopMoneyErrorMessage(err, "Could not open this shop's money.") });
    }
  }, [supplierId, period]);
  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(["payouts", "availability"], load);

  const changed = useCallback(
    async (message: string) => {
      await Promise.all([onChanged(message), load()]);
    },
    [onChanged, load],
  );

  const run = latestRun(desk);
  const runRow = useMemo(
    () => (run ? runRows(run, desk.transfers, desk.shops).find((r) => r.shop.supplierId === supplierId) ?? null : null),
    [run, desk.transfers, desk.shops, supplierId],
  );
  const shopTransfers = desk.transfers.filter((t) => t.supplierId === supplierId);
  const open = shopTransfers.filter((t) => transferOpen(transferStatusOf(t)));
  const recorded = shopTransfers
    .filter((t) => !transferOpen(transferStatusOf(t)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  const viewer = { userId: user?.id, superAdmin };

  if (loaded.kind === "loading") return <SkeletonCards count={2} label="Opening the shop" />;
  if (loaded.kind === "failed")
    return (
      <ErrorState
        body={loaded.message}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );

  const { balances, payGridgo, policy } = loaded.shop;
  const status = balanceStatus(balances);
  const canPrepare = Boolean(run && runRow?.lane === "to_send");

  return (
    <article className="flex flex-col gap-4" aria-labelledby="shop-money-name">
      <header className="gg-card flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="shop-money-name" className="text-h2 text-text-primary m-0">
            {shopName}
          </h2>
          <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
        </div>
        <dl className="m-0 grid grid-cols-2 gap-3 pt-2 xl:grid-cols-4">
          <Fact label="GRIDGO owes the shop" value={formatPhp(balances.owedMinor)} />
          <Fact label="The shop owes GRIDGO" value={formatPhp(balances.owingMinor)} />
          <Fact label="Net" value={netWords(balances.netMinor)} />
          <Fact label="Paid out so far" value={formatPhp(balances.paidMinor)} />
        </dl>
        <p className="text-caption text-text-secondary m-0">
          Next payout run {manilaWhenWords(balances.nextPayoutAt)}. Work not yet released stays in what GRIDGO
          owes but is not sent until its stage is ready.
        </p>
      </header>

      {open.map((t, i) => (
        <TransferSlip
          key={t.id}
          transfer={t}
          shopName={shopName}
          base={base}
          canAct={canActOnTransfer(t, viewer)}
          mine={t.data.payerId === user?.id}
          primary={i === 0}
          onChanged={changed}
        />
      ))}

      {canPrepare && run && runRow ? (
        <RunShopCard
          run={run}
          shop={runRow.shop}
          shopName={shopName}
          base={base}
          primary={open.length === 0}
          onPrepared={async () => {
            await changed(`Prepared. Send the frozen amount to ${shopName} once, then record it.`);
          }}
        />
      ) : runRow && (runRow.lane === "rolled_over" || runRow.lane === "held") ? (
        <section className="gg-card flex flex-col gap-2 p-4" aria-labelledby="run-shop-heading">
          <h3 id="run-shop-heading" className="text-h3 text-text-primary m-0">
            In the latest run
          </h3>
          {runRow.lane === "rolled_over" ? (
            <p className="text-body text-text-primary m-0">
              {formatPhp(runRow.shop.rolloverMinor)} is ready, under the {formatPhp(run!.data.minimumMinor)} minimum. It
              rolls into the next business day&rsquo;s run.
            </p>
          ) : (
            <p className="text-body text-text-primary m-0">Nothing can be sent yet.</p>
          )}
          <HeldList held={runRow.shop.held} />
        </section>
      ) : null}

      {payGridgo ? (
        <PayGridgoCard request={payGridgo} shopName={shopName} paused={balances.paused} onChanged={changed} />
      ) : null}

      {recorded.length ? (
        <section className="gg-card flex flex-col p-4" aria-labelledby="recorded-heading">
          <h3 id="recorded-heading" className="text-h3 text-text-primary m-0 pb-2">
            Recent transfers
          </h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {recorded.map((t) => {
              const s = TRANSFER_STATE[transferStatusOf(t)];
              return (
                <li key={t.id} className="border-outline-subtle flex flex-wrap items-center justify-between gap-2 border-t py-2 first:border-t-0">
                  <span className="flex flex-col items-start">
                    <StatusChip tone={s.tone} icon={s.icon} label={s.label} />
                    <span className="text-caption text-text-muted pt-1">Prepared {manilaWhenWords(t.at)}</span>
                  </span>
                  <span className="text-body text-text-primary tabular-nums">{formatPhp(t.data.netAmountMinor)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <CounterCashPolicy
        supplierId={supplierId}
        shopName={shopName}
        policy={policy}
        superAdmin={superAdmin}
        onChanged={changed}
      />

      <section className="gg-card flex flex-col gap-2 p-4" aria-labelledby="ledger-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ledger-heading" className="text-h3 text-text-primary m-0">
            Ledger
          </h3>
          <ToggleGroup
            value={[period]}
            onValueChange={(value: string[]) => {
              const next = value[0];
              if (next === "week" || next === "month") setPeriod(next);
            }}
            variant="outline"
            aria-label="Ledger period"
          >
            <ToggleGroupItem value="week" className="min-h-11 px-3">
              Week
            </ToggleGroupItem>
            <ToggleGroupItem value="month" className="min-h-11 px-3">
              Month
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <PaymentMethods methods={loaded.shop.paymentMethods} />
        <Ledger shop={loaded.shop} base={base} />
      </section>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body text-text-primary m-0 tabular-nums" style={medium}>
        {value}
      </dd>
    </div>
  );
}

function ItemList({ items, base }: { items: ShopMoneyItem[]; base: "/ops" | "/admin" }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label="What this pays for">
      {items.map((item) => (
        <li key={item.key} className="border-outline-subtle flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t py-2 first:border-t-0">
          <span className="flex min-w-0 flex-col">
            <span className="text-body text-text-primary">{itemLabel(item.key)}</span>
            <Link href={`${base}/orders/${encodeURIComponent(item.orderId)}`} className="text-caption text-text-secondary underline">
              Open the order
            </Link>
          </span>
          <span className="flex flex-col items-end">
            <span className="text-body text-text-primary tabular-nums">{formatPhp(item.netAmountMinor)}</span>
            {item.recoveryMinor ? (
              <span className="text-caption text-text-muted tabular-nums">
                {formatPhp(item.amountMinor)} less {formatPhp(item.recoveryMinor)} recovered
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HeldList({ held }: { held: { key: string; reason: string }[] }) {
  const summary = heldSummary(held);
  if (!summary.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption text-text-muted m-0">Waiting, not in this transfer</p>
      <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5">
        {summary.map((h) => (
          <li key={h.reason} className="text-body text-text-secondary">
            {h.count === 1 ? h.label : `${h.label} (${h.count})`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunShopCard({
  run,
  shop,
  shopName,
  base,
  primary,
  onPrepared,
}: {
  run: NonNullable<ReturnType<typeof latestRun>>;
  shop: ShopMoneyRunShop;
  shopName: string;
  base: "/ops" | "/admin";
  primary: boolean;
  onPrepared: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const recovered = recoveredMinor(shop.items);
  return (
    <section className="gg-card flex flex-col gap-3 p-4" aria-labelledby="run-shop-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="run-shop-heading" className="text-h3 text-text-primary m-0">
          Ready to prepare
        </h3>
        <span className="text-caption text-text-muted">Run of {manilaWhenWords(run.at)}</span>
      </div>
      <p className="text-h2 text-text-primary m-0 tabular-nums">{formatPhp(shop.amountMinor)}</p>
      {shop.amountMinor === 0 ? (
        <p className="text-body text-text-secondary m-0">
          Everything here is covered by what the shop owed GRIDGO. Preparing it lets you settle it with no transfer.
        </p>
      ) : recovered > 0 ? (
        <p className="text-body text-text-secondary m-0">After {formatPhp(recovered)} recovered for what the shop owed GRIDGO.</p>
      ) : null}
      <ItemList items={shop.items} base={base} />
      <HeldList held={shop.held} />
      <div>
        <Button variant={primary ? "primary" : "secondary"} onClick={() => setConfirm(true)}>
          Prepare transfer
        </Button>
      </div>
      <PrepareTransferDialog
        open={confirm}
        run={run}
        shop={shop}
        shopName={shopName}
        onClose={() => setConfirm(false)}
        onPrepared={async () => {
          setConfirm(false);
          await onPrepared();
        }}
      />
    </section>
  );
}

/**
 * The frozen instruction: the one amount to send, where it goes, and what it
 * pays for. Its state line says what to do next; nothing on it can send twice.
 */
function TransferSlip({
  transfer,
  shopName,
  base,
  canAct,
  mine,
  primary,
  onChanged,
}: {
  transfer: ShopMoneyTransfer;
  shopName: string;
  base: "/ops" | "/admin";
  canAct: boolean;
  mine: boolean;
  primary: boolean;
  onChanged: (message: string) => Promise<void>;
}) {
  const [dialog, setDialog] = useState<null | "record" | "unknown" | "cancel">(null);
  const status = transferStatusOf(transfer);
  const state = TRANSFER_STATE[status];
  const offset = isOffsetTransfer(transfer);
  const unknown = status === "transfer_unknown";
  const recovered = recoveredMinor(transfer.data.items);
  const close = () => setDialog(null);
  const done = async (message: string) => {
    setDialog(null);
    await onChanged(message);
  };

  return (
    <section
      className={`gg-card flex flex-col gap-3 p-4 ${unknown ? "border-error border-2" : "border-text-primary border-2"}`}
      aria-labelledby={`slip-${transfer.id}`}
      data-testid="transfer-slip"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`slip-${transfer.id}`} className="text-h3 text-text-primary m-0">
          {offset ? "Settle without a transfer" : "Transfer to send"}
        </h3>
        <StatusChip tone={state.tone} icon={state.icon} label={state.label} />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-h1 text-text-primary m-0 tabular-nums" data-testid="frozen-amount">
          {formatPhp(transfer.data.netAmountMinor)}
        </p>
        <p className="text-caption text-text-secondary m-0">
          {recovered > 0
            ? `${formatPhp(transfer.data.grossAmountMinor)} earned, less ${formatPhp(recovered)} recovered for what the shop owed. `
            : ""}
          Frozen {manilaWhenWords(transfer.at)} by {mine ? "you" : "another team member"}. GRIDGO pays any transfer fee.
        </p>
      </div>
      <p className={`text-body m-0 ${unknown ? "text-error" : "text-text-primary"}`} role={unknown ? "alert" : undefined}>
        {state.next}
      </p>
      {!offset ? <FrozenDestination transfer={transfer} shopName={shopName} /> : null}
      <ItemList items={transfer.data.items} base={base} />

      {canAct ? (
        <div className="flex flex-wrap gap-2">
          <Button variant={primary ? "primary" : "secondary"} onClick={() => setDialog("record")}>
            {offset ? "Settle without a transfer" : "Record transfer"}
          </Button>
          {!offset && !unknown ? (
            <Button variant="outline" onClick={() => setDialog("unknown")}>
              Outcome unknown
            </Button>
          ) : null}
          <Button variant="danger" onClick={() => setDialog("cancel")}>
            Not sent
          </Button>
        </div>
      ) : (
        <p className="text-caption text-text-secondary m-0">
          Prepared by another team member. Only they or Super Admin can record or cancel it. Do not send it yourself.
        </p>
      )}

      <RecordTransferDialog open={dialog === "record"} transfer={transfer} shopName={shopName} onClose={close} onRecorded={done} />
      <TransferOutcomeDialog
        open={dialog === "unknown" || dialog === "cancel"}
        mode={dialog === "cancel" ? "cancel" : "unknown"}
        transfer={transfer}
        shopName={shopName}
        onClose={close}
        onDone={done}
      />
    </section>
  );
}

function PayGridgoCard({
  request,
  shopName,
  paused,
  onChanged,
}: {
  request: NonNullable<ShopMoneyShop["payGridgo"]>;
  shopName: string;
  paused: boolean;
  onChanged: (message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="gg-card flex flex-col gap-2 p-4" aria-labelledby="paygg-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="paygg-heading" className="text-h3 text-text-primary m-0">
          Pay GRIDGO
        </h3>
        {paused ? (
          <StatusChip tone="error" icon="circle-x" label="New orders paused" />
        ) : (
          <StatusChip tone="warning" icon="clock" label={`Due ${manilaWhenWords(request.deadlineAt)}`} />
        )}
      </div>
      <p className="text-h2 text-text-primary m-0 tabular-nums">{formatPhp(request.amountMinor)}</p>
      <p className="text-body text-text-secondary m-0">
        {shopName} pays this to GRIDGO&rsquo;s QR with reference <span className="text-text-primary">{request.reference}</span>.
        {paused
          ? " The deadline passed, so new orders are paused; accepted jobs still finish. Confirming reopens them."
          : " If it is unpaid at the deadline, new orders pause until it is confirmed."}{" "}
        GRIDGO confirms it by hand once it shows in GRIDGO&rsquo;s account.
      </p>
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Confirm payment received
        </Button>
      </div>
      <ConfirmPayGridgoDialog
        open={open}
        request={request}
        shopName={shopName}
        onClose={() => setOpen(false)}
        onConfirmed={async (message) => {
          setOpen(false);
          await onChanged(message);
        }}
      />
    </section>
  );
}

function CounterCashPolicy({
  supplierId,
  shopName,
  policy,
  superAdmin,
  onChanged,
}: {
  supplierId: string;
  shopName: string;
  policy: ShopMoneyShop["policy"];
  superAdmin: boolean;
  onChanged: (message: string) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = policy.counterCashEnabled;

  async function save() {
    if (confirm === null || busy) return;
    if (!reason.trim()) {
      setError("Write a reason for the record.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateShopMoneyPolicy(supplierId, { expectedVersion: policy.version, counterCashEnabled: confirm, reason: reason.trim() });
      setConfirm(null);
      setReason("");
      await onChanged(confirm ? `Cash at the counter is on for ${shopName}.` : `Cash at the counter is off for ${shopName}.`);
    } catch (err) {
      setError(shopMoneyErrorMessage(err, "The switch was not changed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card flex flex-col gap-2 p-4" aria-labelledby="counter-cash-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="counter-cash-heading" className="text-h3 text-text-primary m-0">
          Cash at the counter
        </h3>
        {superAdmin ? (
          <Switch
            checked={on}
            disabled={busy}
            aria-label={`Cash at the counter for ${shopName}`}
            onCheckedChange={(checked) => {
              setError(null);
              setReason("");
              setConfirm(Boolean(checked));
            }}
          />
        ) : (
          <StatusChip tone="neutral" icon={on ? "circle-check" : "circle-dashed"} label={on ? "On" : "Off"} />
        )}
      </div>
      <p className="text-body text-text-secondary m-0">
        Off at launch. When on, GRIDGO&rsquo;s share of counter cash is owed by the shop, a negative net is
        paid with Pay GRIDGO, and new orders pause if it is unpaid at the deadline. It adds no checkout option.
        {superAdmin ? "" : " Super Admin turns it on per shop."}
      </p>

      <AlertDialog open={confirm !== null} onOpenChange={(next) => (!next && !busy ? setConfirm(null) : null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm ? `Turn on cash at the counter for ${shopName}?` : `Turn off cash at the counter for ${shopName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? "Only for a verified shop, with GRIDGO's receiving QR set. The shop may then owe GRIDGO and be paused for an unpaid Pay GRIDGO."
                : "Requests already issued keep their deadline and pause until paid or recovered."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="counter-cash-reason">Reason</FieldLabel>
            <Textarea id="counter-cash-reason" rows={2} maxLength={2000} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
            <FieldDescription>Kept on the audit trail. The shop is told its policy changed.</FieldDescription>
          </Field>
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm ? "primary" : "danger"}
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {busy ? "Saving…" : confirm ? "Turn on" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function PaymentMethods({ methods }: { methods: ShopMoneyShop["paymentMethods"] }) {
  const entries = Object.entries(methods).filter(([, n]) => (n ?? 0) > 0);
  if (!entries.length) return null;
  return (
    <p className="text-caption text-text-secondary m-0">
      How clients paid:{" "}
      {entries.map(([method, n], i) => (
        <span key={method}>
          {i ? ", " : ""}
          {PAYMENT_METHOD_LABEL[method] ?? method} {n}
        </span>
      ))}
    </p>
  );
}

function Ledger({ shop, base }: { shop: ShopMoneyShop; base: "/ops" | "/admin" }) {
  const rows = ledgerRows(shop.history);
  if (!rows.length) return <p className="text-body text-text-secondary m-0">No ledger entries in this period.</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((entry) => {
        const owed = entry.owedDeltaMinor;
        const owing = entry.owingDeltaMinor;
        return (
          <li key={entry.id} className="border-outline-subtle flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t py-2 first:border-t-0">
            <span className="flex min-w-0 flex-col">
              <span className="text-body text-text-primary">{ledgerLine(entry)}</span>
              <span className="text-caption text-text-muted">
                {manilaWhenWords(entry.at)}
                {entry.orderId ? (
                  <>
                    {" · "}
                    <Link href={`${base}/orders/${encodeURIComponent(entry.orderId)}`} className="underline">
                      Open the order
                    </Link>
                  </>
                ) : null}
              </span>
            </span>
            <span className="text-body text-text-primary tabular-nums">
              {owed ? `${owed > 0 ? "+" : "−"}${formatPhp(Math.abs(owed))} owed` : null}
              {owed && owing ? " · " : null}
              {owing ? `${owing > 0 ? "+" : "−"}${formatPhp(Math.abs(owing))} owing` : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
