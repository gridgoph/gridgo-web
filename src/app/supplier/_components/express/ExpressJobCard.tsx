"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, Check, FileText, FolderOpen, KeyRound, Printer, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { acceptExpressJob, declineExpressJob, getOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { jobEarningsMinor } from "@/app/supplier/_lib/dashboard";
import {
  EXPRESS_ACCEPT_SECONDS,
  expressStage,
  expressView,
  formatOfferClock,
  fulfilmentLine,
  offerSecondsLeft,
  paymentLine,
  settingsLine,
  workLine,
} from "@/lib/express-shop";
import { formatPhp } from "@/lib/format";
import { hasSpecialInstructions, itemInstructions } from "@/lib/order-changes";
import { orderReference } from "@/lib/order-reference";
import { useShortcut } from "@/lib/use-shortcut";
import { cn } from "@/lib/utils";

import { CounterCodeSheet } from "./CounterCodeSheet";
import { ExpressDeclineDialog } from "./ExpressDeclineDialog";
import { acceptErrorMessage, markExpressReady } from "./express-actions";

/** A second-by-second clock while an offer runs. */
function useTick(on: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

/** The five minutes as a ring: the arc that is left, the time in words inside. */
function OfferClock({ seconds }: { seconds: number }) {
  const r = 26;
  const length = 2 * Math.PI * r;
  const left = Math.min(1, seconds / EXPRESS_ACCEPT_SECONDS);
  const urgent = seconds <= 60;
  return (
    <div
      className="relative flex size-16 shrink-0 items-center justify-center"
      role="timer"
      aria-label={`${formatOfferClock(seconds)} left to accept`}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" stroke="var(--color-outline)" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          stroke={urgent ? "var(--color-error)" : "var(--color-text-primary)"}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - left)}
        />
      </svg>
      <span className="flex flex-col items-center leading-none">
        <span
          className="text-body-lg text-text-primary tabular-nums"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {formatOfferClock(seconds)}
        </span>
        <span className="text-caption text-text-muted">left</span>
      </span>
    </div>
  );
}

/** The two-line label on a big action: the verb, then Bisaya and its key. */
function ActionLabel({ verb, local, shortcut }: { verb: string; local: string; shortcut?: string }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-body-lg" style={{ fontFamily: "var(--font-bold)" }}>
        {verb}
      </span>
      <span className="text-caption">
        {local}
        {shortcut ? (
          <span className="hidden md:inline">
            {" · or press "}
            <kbd className="font-[inherit]">{shortcut}</kbd>
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * The Express "do this first" card (gridgoph/gridgo-web#327). An offer shows
 * the work, how the client gets it and paid, what the shop earns (Owner), the
 * five minutes and one big Accept (A). Accepted, it shows Open files and It's
 * ready (R). Ready at the counter, it opens the client's code.
 *
 * `shortcuts` is true for one card on a page, so A and R press one job only.
 */
export function ExpressJobCard({
  order,
  showMoney,
  shortcuts,
  onChanged,
  onHandedOver,
  showDetailsLink = true,
}: {
  order: Order;
  showMoney: boolean;
  shortcuts: boolean;
  onChanged: (order: Order | null) => void;
  onHandedOver: (order: Order) => void;
  showDetailsLink?: boolean;
}) {
  const router = useRouter();
  const stage = expressStage(order);
  const now = useTick(stage === "offer");
  const [busy, setBusy] = useState<"accept" | "ready" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsStep, setNeedsStep] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [noteRead, setNoteRead] = useState(false);
  const [tickMissing, setTickMissing] = useState(false);

  const view = expressView(order);
  const notes = [
    ...itemInstructions(order).map((note) => note.text),
    ...(view?.prints.map((print) => print.note) ?? []),
  ].filter((text, index, all) => text && all.indexOf(text) === index);
  const needsTick = hasSpecialInstructions(order) || notes.length > 0;
  const seconds = stage === "offer" ? offerSecondsLeft(order, now) : null;
  const expired = seconds === 0;
  const earn = showMoney ? jobEarningsMinor(order) : 0;
  const reference = orderReference(order.id);
  const jobHref = `/supplier/jobs/${encodeURIComponent(order.id)}`;

  async function accept() {
    if (busy || expired) return;
    if (needsTick && !noteRead) {
      setTickMissing(true);
      return;
    }
    setBusy("accept");
    setError(null);
    try {
      await acceptExpressJob(order.id, needsTick);
      onChanged(await getOrder(order.id).catch(() => null));
    } catch (caught) {
      setError(acceptErrorMessage(caught));
      onChanged(await getOrder(order.id).catch(() => null));
    } finally {
      setBusy(null);
    }
  }

  async function ready() {
    if (busy) return;
    setBusy("ready");
    setError(null);
    setNeedsStep(false);
    const result = await markExpressReady(order);
    setBusy(null);
    if (result.kind === "ready") {
      onChanged(result.order);
      return;
    }
    setError(result.message);
    setNeedsStep(result.kind === "needs_step");
    onChanged(await getOrder(order.id).catch(() => null));
  }

  async function decline(reason: string) {
    setBusy("decline");
    setDeclineError(null);
    try {
      await declineExpressJob(order.id, reason);
      setDeclineOpen(false);
      onChanged(null);
    } catch (caught) {
      setDeclineError(acceptErrorMessage(caught).replace("Accept", "Your answer"));
    } finally {
      setBusy(null);
    }
  }

  useShortcut("a", () => void accept(), shortcuts && stage === "offer" && !expired);
  useShortcut("r", () => void ready(), shortcuts && stage === "working");

  if (!stage || !view) return null;

  const offer = stage === "offer";
  // One yellow action per page: only the card that owns the shortcuts (the
  // one to do first) draws it; the rest use the monochrome fill.
  const lead = shortcuts ? "primary" : "default";
  const headline = [workLine(order), settingsLine(order)].filter(Boolean).join(" · ");
  const how = [fulfilmentLine(order), paymentLine(order)].filter(Boolean).join(" · ");
  const Icon = offer ? FileText : stage === "working" ? Printer : stage === "counter" ? KeyRound : Bike;
  const chip = offer
    ? "New Express job · do this first"
    : stage === "working"
      ? `Accepted${reference ? ` · #${reference}` : ""} · Express`
      : stage === "counter"
        ? "Ready · the client is coming"
        : "Ready · for the rider";

  return (
    <section
      aria-label={`Express job${reference ? ` ${reference}` : ""}`}
      data-express-stage={stage}
      className={cn(
        "gg-card flex flex-col gap-4 p-4 md:flex-row md:items-center",
        offer ? "border-2 border-text-primary" : "border border-outline",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span
          className="bg-surface-variant text-text-primary hidden size-14 shrink-0 items-center justify-center rounded-card sm:flex"
          aria-hidden
        >
          <Icon className="size-7" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="gg-chip border-outline w-fit">
            {offer ? (
              <Zap size={13} strokeWidth={2} aria-hidden style={{ color: "var(--color-info)" }} />
            ) : (
              <Check size={13} strokeWidth={2} aria-hidden style={{ color: "var(--color-success)" }} />
            )}
            <span className="text-caption text-text-primary">{chip}</span>
          </span>
          <h3 className="text-h2 text-text-primary m-0">{headline}</h3>
          <p className="text-body text-text-secondary m-0">
            {how}
            {showDetailsLink ? (
              <>
                {how ? " · " : ""}
                <Link href={jobHref} className="text-text-primary underline">
                  Details
                </Link>
              </>
            ) : null}
            {offer ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="text-text-primary cursor-pointer underline"
                  disabled={busy !== null}
                  onClick={() => {
                    setDeclineError(null);
                    setDeclineOpen(true);
                  }}
                >
                  Can&rsquo;t do it
                </button>
              </>
            ) : null}
          </p>
          {notes.length ? (
            <p className="text-body text-text-primary m-0 max-w-prose">
              <span className="text-text-muted">Client&rsquo;s note: </span>
              &ldquo;{notes.join(" / ")}&rdquo;
            </p>
          ) : null}
          {offer && needsTick ? (
            <label className="flex min-h-11 items-center gap-3">
              <Checkbox
                checked={noteRead}
                onCheckedChange={(checked) => {
                  setNoteRead(Boolean(checked));
                  setTickMissing(false);
                }}
              />
              <span className="text-body text-text-primary">I&rsquo;ve read the client&rsquo;s note</span>
            </label>
          ) : null}
          {tickMissing && !noteRead ? (
            <p className="text-body text-error m-0" role="alert">
              Tick that you read the client&rsquo;s note, then accept.
            </p>
          ) : null}
          {stage === "rider" ? (
            <p className="text-body text-text-secondary m-0">
              The rider checks it with you at the counter, as today.
            </p>
          ) : null}
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}{" "}
              {needsStep ? (
                <Link href={jobHref} className="text-text-primary underline">
                  Open the job
                </Link>
              ) : null}
            </p>
          ) : null}
          {expired ? (
            <p className="text-body text-text-secondary m-0" role="status">
              The five minutes ran out. GRIDGO is sending it to the next shop.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 md:flex-nowrap md:justify-end">
        {offer && earn > 0 ? (
          <div className="flex flex-col">
            <span className="text-caption text-text-muted">You earn</span>
            <span className="text-h2 text-text-primary tabular-nums">{formatPhp(earn)}</span>
          </div>
        ) : null}
        {offer && seconds != null ? <OfferClock seconds={seconds} /> : null}
        {offer ? (
          <Button
            variant={lead}
            className="h-16 w-full min-w-44 px-8 md:w-auto"
            disabled={busy !== null || expired}
            aria-keyshortcuts={shortcuts ? "A" : undefined}
            onClick={() => void accept()}
          >
            {busy === "accept" ? (
              "Accepting…"
            ) : (
              <ActionLabel verb="Accept" local="Dawata" shortcut={shortcuts ? "A" : undefined} />
            )}
          </Button>
        ) : null}
        {stage === "working" ? (
          <>
            <Button
              variant="outline"
              className="h-16 flex-1 px-6 md:flex-none"
              onClick={() => router.push(`${jobHref}/files`)}
            >
              <FolderOpen data-icon="inline-start" aria-hidden />
              Open files
            </Button>
            <Button
              variant={lead}
              className="h-16 flex-1 min-w-44 px-8 md:flex-none"
              disabled={busy !== null}
              aria-keyshortcuts={shortcuts ? "R" : undefined}
              onClick={() => void ready()}
            >
              {busy === "ready" ? (
                "Marking ready…"
              ) : (
                <ActionLabel verb="It's ready" local="Andam na" shortcut={shortcuts ? "R" : undefined} />
              )}
            </Button>
          </>
        ) : null}
        {stage === "counter" ? (
          <Button
            variant={lead}
            className="h-16 w-full min-w-44 px-8 md:w-auto"
            onClick={() => setCodeOpen(true)}
          >
            <ActionLabel verb="Type code" local="Ihatag" />
          </Button>
        ) : null}
        {stage === "rider" ? (
          <Button variant="outline" className="h-12" onClick={() => router.push(jobHref)}>
            Open the job
          </Button>
        ) : null}
      </div>

      <ExpressDeclineDialog
        open={declineOpen}
        busy={busy === "decline"}
        error={declineError}
        onCancel={() => setDeclineOpen(false)}
        onDecline={(reason) => void decline(reason)}
      />
      {stage === "counter" ? (
        <CounterCodeSheet
          order={order}
          open={codeOpen}
          onOpenChange={setCodeOpen}
          onHandedOver={() => {
            setCodeOpen(false);
            void getOrder(order.id)
              .catch(() => order)
              .then((fresh) => onHandedOver(fresh));
          }}
        />
      ) : null}
    </section>
  );
}
