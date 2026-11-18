"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { DeskContext, DeskData } from "@/components/cash/CashDesk";
import {
  ClaimReturnDialog,
  ClientTransferDialog,
  NoShowDialog,
  RemedyDialog,
  ShopFailureDialog,
  shopNameOf,
  type RemedyStep,
} from "@/components/cash/dialogs";
import { EvidenceButton } from "@/components/cash/parts";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CashIncident } from "@/lib/api/cash";
import type { Order } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CASH_REMEDY_APPROVAL_MINOR,
  REMEDY_LABEL,
  REMEDY_STAGE_COPY,
  formatWait,
  noShowWaiting,
  redeliveryWaiting,
  remedyCases,
  repaymentWaiting,
  shopFailurePath,
  type CashRemedyCase,
  type RemedyStage,
  type ShopFailurePath,
} from "@/lib/cash";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { OctagonX } from "lucide-react";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Facts = { label: string; value: React.ReactNode }[];

function Facts({ facts }: { facts: Facts }) {
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label} className="flex min-w-0 flex-col">
          <dt className="text-caption text-text-secondary">{fact.label}</dt>
          <dd className="m-0 text-body text-text-primary break-words" style={medium}>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function OrderLink({ order, base }: { order: Order; base: string }) {
  return (
    <Link
      href={`${base}/orders/${encodeURIComponent(order.id)}`}
      className="text-body text-text-primary underline underline-offset-4 break-all"
      style={medium}
    >
      {order.title || "Order"} <span className="text-text-secondary">({order.id})</span>
    </Link>
  );
}

function Case({
  title,
  order,
  base,
  chip,
  facts,
  children,
}: {
  title: string;
  order: Order;
  base: string;
  chip?: React.ReactNode;
  facts: Facts;
  children?: React.ReactNode;
}) {
  return (
    <li className="gg-card flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            {title}
          </h3>
          <OrderLink order={order} base={base} />
        </div>
        {chip}
      </div>
      <Facts facts={facts} />
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </li>
  );
}

function Section({
  id,
  title,
  body,
  count,
  empty,
  children,
}: {
  id: string;
  title: string;
  body: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-h3 text-text-primary m-0">
        {title} <span className="text-text-secondary tabular-nums">({count})</span>
      </h2>
      <p className="text-body text-text-secondary m-0 max-w-prose">{body}</p>
      {count ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{children}</ul>
      ) : (
        <p className="text-body text-text-secondary m-0 rounded-card border border-dashed border-outline px-3 py-3">
          {empty}
        </p>
      )}
    </section>
  );
}

const STAGE_TONE: Record<
  RemedyStage,
  {
    tone: "warning" | "info" | "success" | "error" | "neutral";
    icon: "clock" | "circle-check" | "triangle-alert" | "circle-dot" | "circle-help";
  }
> = {
  needs_super_admin: { tone: "warning", icon: "clock" },
  waiting_destination: { tone: "neutral", icon: "clock" },
  ready: { tone: "info", icon: "circle-dot" },
  reserved: { tone: "warning", icon: "triangle-alert" },
  unknown: { tone: "error", icon: "circle-help" },
  paid: { tone: "success", icon: "circle-check" },
};

/**
 * Every cash incident Operations decides: no-shows, the client's online
 * repayment and redelivery fare, a shop that cannot produce, the shop-cash
 * claims that follow, and evidence-backed remedies after collection.
 */
export function IncidentsPanel({ data, ctx }: { data: DeskData; ctx: DeskContext }) {
  const { user } = useAuth();
  const base = ctx.base;
  const byId = useMemo(
    () => new Map(data.orders.map((order) => [order.id, order])),
    [data.orders],
  );

  const noShows = data.orders.filter(noShowWaiting);
  const transfers = data.orders.flatMap((order) => [
    ...(repaymentWaiting(order) ? [{ order, kind: "repayment" as const }] : []),
    ...(redeliveryWaiting(order) ? [{ order, kind: "redelivery" as const }] : []),
  ]);
  const [claimFilter, setClaimFilter] = useState<"outstanding" | "resolved">(
    "outstanding",
  );
  const claims = data.incidents.filter((incident) => incident.status === claimFilter);
  const failures = data.orders
    .map((order) => ({ order, path: shopFailurePath(order) }))
    .filter((row): row is { order: Order; path: ShopFailurePath } => row.path !== null);
  const remedies = remedyCases(data.orders, data.issues ?? []);
  const openRemedies = remedies.filter((c) => c.stage !== "paid");

  const [noShow, setNoShow] = useState<{
    order: Order;
    action: "approve" | "reject";
  } | null>(null);
  const [transfer, setTransfer] = useState<{
    order: Order;
    kind: "repayment" | "redelivery";
    action: "confirm" | "reject";
  } | null>(null);
  const [failure, setFailure] = useState<{ order: Order; path: ShopFailurePath } | null>(
    null,
  );
  const [claim, setClaim] = useState<{ order: Order; incident: CashIncident } | null>(
    null,
  );
  const [remedy, setRemedy] = useState<{
    remedy: CashRemedyCase;
    step: RemedyStep;
  } | null>(null);

  const failureColumns = useMemo<
    DataTableColumn<{ order: Order; path: ShopFailurePath }>[]
  >(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => row.order.title ?? row.order.id,
        cell: (row) => <OrderLink order={row.order} base={base} />,
      },
      {
        id: "shop",
        header: "Shop",
        sortValue: (row) => shopNameOf(row.order),
        cell: (row) => (
          <span className="text-body text-text-primary">{shopNameOf(row.order)}</span>
        ),
      },
      {
        id: "state",
        header: "Stage",
        sortValue: (row) => row.order.state,
        cell: (row) => (
          <span className="text-body text-text-secondary">
            {presentOrderState(row.order.state).label}
          </span>
        ),
      },
      {
        id: "cash",
        header: "Shop cash",
        sortValue: (row) => row.path,
        cell: (row) =>
          row.path === "open_claim" ? (
            <span className="text-body text-text-primary tabular-nums">
              {formatPhp(row.order.cashAmounts?.shopMinor ?? 0)} paid by{" "}
              {ctx.riderName(row.order.riderId)}
            </span>
          ) : (
            <span className="text-body text-text-secondary">Not paid yet</span>
          ),
      },
    ],
    [base, ctx],
  );

  return (
    <div className="flex flex-col gap-6">
      <Section
        id="cash-no-shows"
        title="No-show reports"
        body="The rider paid the shop, reached the client, waited the full time and could not hand over. Approve once the parcel is back at GRIDGO."
        count={noShows.length}
        empty="No rider is waiting on a no-show decision."
      >
        {noShows.map((order) => {
          const p = order.cashProgress ?? {};
          return (
            <Case
              key={order.id}
              title={`${ctx.riderName(order.riderId)} reported a no-show`}
              order={order}
              base={base}
              chip={
                <StatusChip tone="warning" icon="clock" label="Waiting for Operations" />
              }
              facts={[
                {
                  label: "Shop advance to reimburse",
                  value: formatPhp(order.cashAmounts?.shopMinor ?? 0),
                },
                { label: "Client total", value: formatPhp(order.totalMinor) },
                { label: "Reported", value: formatDateTime(p.noShowReportedAt) },
                {
                  label: "Tried to reach the client",
                  value: `${p.contactMethod === "message" ? "By message" : "By call"}, from ${formatDateTime(p.noShowStartedAt)}`,
                },
                {
                  label: "Wait required",
                  value: formatWait(order.cash?.noShowWaitSeconds ?? 600),
                },
                { label: "Rider's note", value: p.noShowReason ?? "None" },
                ...(p.rejectedReports?.length
                  ? [
                      {
                        label: "Earlier reports rejected",
                        value: String(p.rejectedReports.length),
                      },
                    ]
                  : []),
              ]}
            >
              <EvidenceButton
                fileId={p.noShowPhotoFileId}
                label="View rider's photo"
                title="Rider's no-show photo"
              />
              <Button
                variant="outline"
                onClick={() => setNoShow({ order, action: "approve" })}
              >
                Approve no-show
              </Button>
              <Button
                variant="outline"
                onClick={() => setNoShow({ order, action: "reject" })}
              >
                Reject report
              </Button>
            </Case>
          );
        })}
      </Section>

      <Section
        id="cash-transfers"
        title="Client payments to check"
        body="After an approved no-show the client repays the order total online, and may pay for a redelivery. Find each transfer in the bank before confirming it."
        count={transfers.length}
        empty="No client payment is waiting for a bank check."
      >
        {transfers.map(({ order, kind }) => {
          const p = order.cashProgress ?? {};
          const submission = kind === "repayment" ? p.repayment : p.redelivery?.payment;
          const amount =
            kind === "repayment" ? order.totalMinor : (p.redelivery?.feeMinor ?? 0);
          return (
            <Case
              key={`${order.id}:${kind}`}
              title={kind === "repayment" ? "No-show repayment" : "Redelivery fare"}
              order={order}
              base={base}
              chip={<StatusChip tone="warning" icon="clock" label="Bank check needed" />}
              facts={[
                { label: "Amount", value: formatPhp(amount) },
                { label: "Client", value: order.clientName || "Not on record" },
                {
                  label: "Reference",
                  value: submission?.reference ?? "No transfer needed",
                },
                { label: "Submitted", value: formatDateTime(submission?.submittedAt) },
              ]}
            >
              {submission?.proofFileId ? (
                <EvidenceButton
                  fileId={submission.proofFileId}
                  label="View proof"
                  title="Client's transfer proof"
                />
              ) : null}
              <Button
                variant="outline"
                onClick={() => setTransfer({ order, kind, action: "confirm" })}
              >
                Confirm payment
              </Button>
              <Button
                variant="outline"
                onClick={() => setTransfer({ order, kind, action: "reject" })}
              >
                Reject payment
              </Button>
            </Case>
          );
        })}
      </Section>

      <section aria-labelledby="cash-claims" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cash-claims" className="text-h3 text-text-primary m-0">
            Shop-cash claims
          </h2>
          <ToggleGroup
            value={[claimFilter]}
            onValueChange={(values) => {
              const next = values[0] as typeof claimFilter | undefined;
              if (next) setClaimFilter(next);
            }}
            variant="outline"
            spacing={0}
            aria-label="Show claims"
          >
            {(["outstanding", "resolved"] as const).map((value) => {
              const count = data.incidents.filter((i) => i.status === value).length;
              const label = value === "outstanding" ? "Outstanding" : "Settled";
              return (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className="h-11 gap-2 px-3"
                  aria-label={`${label}, ${count}`}
                >
                  <span>{label}</span>
                  <span className="text-text-secondary tabular-nums" aria-hidden>
                    {count}
                  </span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          The rider paid a shop that then could not produce. The order is stopped until
          the shop returns the rider&rsquo;s cash. GRIDGO does not advance the money.
        </p>
        {claims.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {claims.map((incident) => {
              const order = byId.get(incident.orderId);
              if (!order) {
                return (
                  <li
                    key={incident.id}
                    className="gg-card p-3 text-body text-text-secondary"
                  >
                    Claim on order {incident.orderId} for{" "}
                    {formatPhp(incident.amountMinor)}: the order is not in the list on
                    screen.
                  </li>
                );
              }
              return (
                <Case
                  key={incident.id}
                  title={`${shopNameOf(order)} owes ${ctx.riderName(incident.riderId)}`}
                  order={order}
                  base={base}
                  chip={
                    incident.status === "outstanding" ? (
                      <StatusChip
                        tone="error"
                        icon="triangle-alert"
                        label="Work stopped"
                      />
                    ) : (
                      <StatusChip tone="success" icon="circle-check" label="Settled" />
                    )
                  }
                  facts={[
                    { label: "Advance", value: formatPhp(incident.amountMinor) },
                    { label: "Returned", value: formatPhp(incident.resolvedMinor) },
                    { label: "Still owed", value: formatPhp(incident.remainingMinor) },
                    { label: "Opened", value: formatDateTime(incident.createdAt) },
                    { label: "What happened", value: incident.reason ?? "Not recorded" },
                  ]}
                >
                  <EvidenceButton
                    fileId={incident.evidenceFileId}
                    label="View photo"
                    title="Claim photo"
                  />
                  {incident.status === "outstanding" ? (
                    <Button
                      variant="outline"
                      onClick={() => setClaim({ order, incident })}
                    >
                      Record cash return
                    </Button>
                  ) : null}
                </Case>
              );
            })}
          </ul>
        ) : (
          <p className="text-body text-text-secondary m-0 rounded-card border border-dashed border-outline px-3 py-3">
            {claimFilter === "outstanding"
              ? "No shop owes a rider cash."
              : "No claim has been settled yet."}
          </p>
        )}
      </section>

      <section aria-labelledby="cash-shop-failures" className="flex flex-col gap-2">
        <h2 id="cash-shop-failures" className="text-h3 text-text-primary m-0">
          When a shop cannot produce
        </h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Cash orders not yet paid by the client. Before the rider pays the shop, the
          order is cancelled outright. After, open a claim so the shop returns the
          rider&rsquo;s cash.
        </p>
        <DataTable
          columns={failureColumns}
          data={failures}
          getRowId={(row) => row.order.id}
          caption="Cash orders in progress"
          itemLabel="orders"
          rowActionsDensity="labeled"
          pageSize={10}
          empty={
            <p className="text-body text-text-secondary m-0 px-3 py-3">
              No cash order is in progress.
            </p>
          }
          rowActions={(row) => (
            <DataTableRowAction
              label="Shop cannot produce"
              icon={OctagonX}
              onClick={() => setFailure(row)}
            />
          )}
        />
      </section>

      <Section
        id="cash-remedies"
        title="Remedies after collection"
        body={`A decided problem report on a collected cash order, not the client's fault. Above ${formatPhp(CASH_REMEDY_APPROVAL_MINOR)} of GRIDGO funding, Super Admin approves the decision in the problem report first.`}
        count={openRemedies.length}
        empty={
          data.issues === null
            ? "Problem reports could not be read, so remedies are not shown. Reload to try again."
            : "No cash remedy is waiting."
        }
      >
        {openRemedies.map((c) => {
          const p = c.order.cashProgress ?? {};
          const live = p.remedy?.decisionId === c.decision.id ? p.remedy : null;
          const mine = live?.payerId === user?.id || ctx.superAdmin;
          const tone = STAGE_TONE[c.stage];
          return (
            <Case
              key={`${c.issue.id}:${c.decision.id}`}
              title={`${REMEDY_LABEL[c.decision.remedy] ?? "Remedy"} for ${formatPhp(c.decision.costMinor ?? 0)}`}
              order={c.order}
              base={base}
              chip={
                <StatusChip
                  tone={tone.tone}
                  icon={tone.icon}
                  label={REMEDY_STAGE_COPY[c.stage]}
                />
              }
              facts={[
                {
                  label: "Fault",
                  value:
                    c.decision.fault === "shop"
                      ? "Shop"
                      : c.decision.fault === "rider"
                        ? "Rider"
                        : "GRIDGO",
                },
                {
                  label: "GRIDGO funds",
                  value: formatPhp(c.decision.gridgoCostMinor ?? 0),
                },
                { label: "Decision", value: c.decision.reason },
                ...(live?.status === "reserved" || live?.status === "unknown"
                  ? [
                      {
                        label: "Reserved",
                        value: `${formatDateTime(live.reservedAt)}${live.payerId === user?.id ? " by you" : ""}`,
                      },
                    ]
                  : []),
              ]}
            >
              {c.stage === "needs_super_admin" ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link href={`${base}/orders/${encodeURIComponent(c.order.id)}`} />
                  }
                >
                  Open the problem report
                </Button>
              ) : null}
              {c.stage === "ready" ? (
                <Button
                  variant="outline"
                  onClick={() => setRemedy({ remedy: c, step: "reserve" })}
                >
                  Reserve transfer
                </Button>
              ) : null}
              {(c.stage === "reserved" || c.stage === "unknown") && mine ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setRemedy({ remedy: c, step: "pay" })}
                  >
                    Record transfer
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setRemedy({ remedy: c, step: "reconcile" })}
                  >
                    Transfer did not go through
                  </Button>
                </>
              ) : null}
              {(c.stage === "reserved" || c.stage === "unknown") && !mine ? (
                <span className="text-caption text-text-secondary">
                  Only the person who reserved it, or Super Admin, can finish this
                  transfer.
                </span>
              ) : null}
            </Case>
          );
        })}
      </Section>

      {noShow ? (
        <NoShowDialog
          order={noShow.order}
          action={noShow.action}
          ctx={ctx}
          onClose={() => setNoShow(null)}
        />
      ) : null}
      {transfer ? (
        <ClientTransferDialog
          order={transfer.order}
          kind={transfer.kind}
          action={transfer.action}
          ctx={ctx}
          onClose={() => setTransfer(null)}
        />
      ) : null}
      {failure ? (
        <ShopFailureDialog
          order={failure.order}
          path={failure.path}
          ctx={ctx}
          onClose={() => setFailure(null)}
        />
      ) : null}
      {claim ? (
        <ClaimReturnDialog
          order={claim.order}
          incident={claim.incident}
          ctx={ctx}
          onClose={() => setClaim(null)}
        />
      ) : null}
      {remedy ? (
        <RemedyDialog
          remedy={remedy.remedy}
          step={remedy.step}
          ctx={ctx}
          onClose={() => setRemedy(null)}
        />
      ) : null}
    </div>
  );
}
