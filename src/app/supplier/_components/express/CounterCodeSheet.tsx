"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { enterExpressPickupCode } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import {
  ALREADY_PAID,
  COUNTER_CODE_LENGTH,
  alreadyPaidAtCounter,
  counterCodeDigits,
  counterCodeOutcome,
  workLine,
} from "@/lib/express-shop";
import { formatClock } from "@/lib/format";
import { orderReference } from "@/lib/order-reference";
import { cn } from "@/lib/utils";

/**
 * Hand over: the client shows six numbers on their phone and the shop types
 * them here. It hands over by itself on the sixth digit; there is nothing else
 * to press. A wrong code clears the boxes and says so.
 */
export function CounterCodeSheet({
  order,
  open,
  onOpenChange,
  onHandedOver,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHandedOver: () => void;
}) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [noCode, setNoCode] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDigits("");
    setMessage(null);
    setNoCode(false);
    sent.current = null;
  }, [open]);

  useEffect(() => {
    if (digits.length !== COUNTER_CODE_LENGTH || busy || sent.current === digits) return;
    sent.current = digits;
    setBusy(true);
    setMessage(null);
    void enterExpressPickupCode(order.id, digits)
      .then(() => onHandedOver())
      .catch((error: unknown) => {
        const outcome = counterCodeOutcome(error);
        setDigits("");
        sent.current = null;
        if (outcome.kind === "wrong") {
          setMessage("That code doesn't match. Ask the client to read it again.");
        } else if (outcome.kind === "locked") {
          setLockedUntil(outcome.until);
          setMessage(
            outcome.until
              ? `Too many wrong codes. Try again after ${formatClock(outcome.until)}, or message GRIDGO.`
              : "Too many wrong codes. Wait a few minutes, or message GRIDGO.",
          );
        } else if (outcome.kind === "unpaid") {
          setMessage("GRIDGO has not confirmed the client's payment yet. Keep the prints and message GRIDGO.");
        } else {
          setMessage("The code did not reach GRIDGO. Check this PC's connection and type it again.");
        }
        requestAnimationFrame(() => input.current?.focus());
      })
      .finally(() => setBusy(false));
  }, [digits, busy, order.id, onHandedOver]);

  // Unlock at GRIDGO's retry time: a render on its own never comes.
  useEffect(() => {
    if (!lockedUntil) return;
    const unlock = () => {
      setLockedUntil(null);
      setMessage(null);
      requestAnimationFrame(() => input.current?.focus());
    };
    const wait = lockedUntil.getTime() - Date.now();
    if (wait <= 0) {
      unlock();
      return;
    }
    const timer = window.setTimeout(unlock, wait);
    return () => window.clearTimeout(timer);
  }, [lockedUntil]);

  const locked = lockedUntil != null && lockedUntil.getTime() > Date.now();
  const reference = orderReference(order.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
        initialFocus={input}
      >
        <SheetHeader className="p-4 pr-14">
          <p className="text-caption text-text-muted m-0">
            {[reference ? `#${reference}` : null, "Express", workLine(order)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <SheetTitle>
            {/* Type size on a plain span: tailwind-merge drops it on SheetTitle. */}
            <span className="text-h2 text-text-primary">Type the client&rsquo;s code</span>
          </SheetTitle>
          <SheetDescription>
            The client shows 6 numbers on their phone. Type them on your keyboard.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="relative w-fit">
            <div className="flex gap-2" aria-hidden>
              {Array.from({ length: COUNTER_CODE_LENGTH }, (_, index) => {
                const filled = digits[index];
                const current = index === digits.length && !busy && !locked;
                return (
                  <span
                    key={index}
                    className={cn(
                      "text-h2 text-text-primary flex h-14 w-11 items-center justify-center rounded-field border-2 tabular-nums sm:w-12",
                      filled ? "border-text-primary" : "border-outline",
                      current && "border-[var(--color-action-yellow)]",
                    )}
                  >
                    {filled ?? ""}
                  </span>
                );
              })}
            </div>
            <input
              ref={input}
              aria-label="Client's code, 6 numbers"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={COUNTER_CODE_LENGTH}
              value={digits}
              disabled={busy || locked}
              onChange={(event) => setDigits(counterCodeDigits(event.target.value))}
              className="absolute inset-0 h-full w-full cursor-text opacity-0"
            />
          </div>
          {alreadyPaidAtCounter(order) ? (
            <p
              className="text-body m-0 flex items-center gap-2"
              style={{ color: "var(--color-success)", fontFamily: "var(--font-medium)" }}
            >
              <Check className="size-4" aria-hidden />
              {ALREADY_PAID}
            </p>
          ) : null}
          <p className="text-body text-text-secondary m-0" aria-live="polite">
            {busy
              ? "Checking the code…"
              : "It hands over by itself when the 6th number is in. Nothing else to click."}
          </p>
          {message ? (
            <p className="text-body text-error m-0" role="alert">
              {message}
            </p>
          ) : null}
          <div className="border-outline-subtle mt-4 border-t pt-3">
            <Button
              variant="link"
              className="px-0"
              aria-expanded={noCode}
              onClick={() => setNoCode((value) => !value)}
            >
              Client has no code
            </Button>
            {noCode ? (
              <p className="text-body text-text-secondary m-0 max-w-prose">
                The code is on the client&rsquo;s order in the GRIDGO app once it says Ready.
                Without it the job cannot be handed over, so don&rsquo;t give the prints
                away. If the client still can&rsquo;t see it, message GRIDGO.
              </p>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
