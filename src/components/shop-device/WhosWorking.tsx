"use client";

import { ArrowLeft, LogOut } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { TeamAvatar } from "@/components/shop-team/TeamAvatar";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/loading";
import { isApiError } from "@/lib/api/client";
import { getWorkingList, selectWorker } from "@/lib/api/shop-team";
import type { ShopMember, ShopPinStaff } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { lockReasonLine, startWorkerTurn, type LockReason } from "@/lib/shop-device";
import { shopRoleLabel } from "@/lib/shop-team";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;

/** Plain words for a refused PIN. The API's message is never shown. */
export function pinErrorCopy(code: string | null | undefined): string {
  switch (code) {
    case "shop_pin_invalid":
      return "That PIN is not right. Try again.";
    case "shop_pin_rate_limited":
      return "Too many wrong PINs. Wait 15 minutes, or ask the owner for a new PIN.";
    case "invalid_shop_pin":
      return "Type the 4 numbers of your PIN.";
    case "shop_device_session_required":
      return "This sign-in cannot share the PC. Sign out, sign in again, then try.";
    case "shop_member_not_found":
    case "invalid_shop_worker_selection":
      return "This person is no longer on the team.";
    default:
      return "That did not go through. Try again.";
  }
}

function isPin(row: ShopMember | ShopPinStaff): row is ShopPinStaff {
  return (row as ShopPinStaff).kind === "pin";
}

type Load =
  | { kind: "loading" }
  | { kind: "ready"; people: ShopPinStaff[]; accounts: ShopMember[] }
  | { kind: "failed" };

/**
 * "Who's working?" on a shared shop PC: the whole screen, nothing of the
 * signed-in account behind it. Click a face, type the 4-digit PIN; the API
 * hands back a turn that every request then carries. People with their own
 * login use it on their own device; this picks phone-free PIN people only.
 */
export function WhosWorking({ reason }: { reason: LockReason }) {
  const auth = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [picked, setPicked] = useState<ShopPinStaff | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const pinId = useId();

  const read = useCallback(async () => {
    setLoad({ kind: "loading" });
    try {
      const list = await getWorkingList();
      const people = list.members.filter(isPin).filter((row) => row.status !== "removed");
      const accounts = list.members.filter((row): row is ShopMember => !isPin(row));
      setLoad({ kind: "ready", people, accounts });
      // Someone removed while picked drops off the list.
      setPicked((current) =>
        current && people.some((row) => row.id === current.id) ? current : null,
      );
    } catch {
      setLoad({ kind: "failed" });
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  useEffect(() => {
    if (picked) inputRef.current?.focus();
  }, [picked]);

  async function submit(value: string) {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const selection = await selectWorker(picked.id, value);
      startWorkerTurn(selection);
      setPin("");
      await auth.refresh();
    } catch (caught) {
      const code = isApiError(caught) ? caught.code : null;
      setError(pinErrorCopy(code));
      setPin("");
      if (code === "shop_member_not_found" || code === "invalid_shop_worker_selection") {
        void read();
      }
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function type(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, PIN_LENGTH);
    setPin(digits);
    if (error) setError(null);
    if (digits.length === PIN_LENGTH) void submit(digits);
  }

  const reasonLine = lockReasonLine(reason);

  return (
    <main
      aria-labelledby={headingId}
      data-testid="whos-working"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-canvas px-4 py-8"
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <p className="text-caption text-text-muted m-0">Shop PC</p>
          <h1 id={headingId} className="text-h1 text-text-primary m-0">
            Who&rsquo;s working?
          </h1>
          {reasonLine ? (
            <p className="text-body text-text-secondary m-0" role="status">
              {reasonLine}
            </p>
          ) : null}
        </div>

        {load.kind === "loading" ? <SkeletonLines lines={2} className="w-64" /> : null}

        {load.kind === "failed" ? (
          <div className="flex flex-col items-center gap-3" role="alert">
            <p className="text-body text-text-primary m-0">Could not read the team.</p>
            <Button variant="secondary" onClick={() => void read()}>
              Try again
            </Button>
          </div>
        ) : null}

        {load.kind === "ready" && !load.people.length ? (
          <p className="text-body text-text-secondary m-0 max-w-prose">
            Nobody has a PIN yet. The owner adds staff with a PIN on the Team page; sign out and
            sign in as the owner to do it.
          </p>
        ) : null}

        {load.kind === "ready" && load.people.length ? (
          <ul
            aria-label="Shop staff"
            className="m-0 flex list-none flex-wrap justify-center gap-4 p-0 md:gap-6"
          >
            {load.people.map((person) => {
              const selected = picked?.id === person.id;
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    data-testid="worker-face"
                    onClick={() => {
                      setPicked(person);
                      setPin("");
                      setError(null);
                    }}
                    className={cn(
                      "flex min-w-24 flex-col items-center gap-2 rounded-card p-2",
                      "hover:bg-overlay-hover",
                      selected && "bg-surface",
                    )}
                  >
                    <TeamAvatar name={person.name} size="lg" selected={selected} />
                    <span
                      className="text-body text-text-primary"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {person.name}
                    </span>
                    <span className="text-caption text-text-muted">
                      {shopRoleLabel(person.role)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {picked ? (
          <form
            className="flex flex-col items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (pin.length === PIN_LENGTH) void submit(pin);
            }}
          >
            <label htmlFor={pinId} className="text-h3 text-text-primary">
              {picked.name}, type your PIN
            </label>
            {/* The real field: typed into from the keyboard. Read-only (never
                disabled) while GRIDGO checks, so focus stays for a retry. */}
            <input
              ref={inputRef}
              id={pinId}
              data-testid="worker-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={PIN_LENGTH}
              value={pin}
              readOnly={busy}
              aria-busy={busy || undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${pinId}-error` : undefined}
              onChange={(event) => {
                if (!busy) type(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setPicked(null);
                  setPin("");
                }
              }}
              className="peer sr-only"
            />
            {/* What the person sees: one dot per digit. A click lands in the field. */}
            <label
              htmlFor={pinId}
              aria-hidden
              className="flex min-h-11 cursor-text items-center gap-3 rounded-field px-4 peer-focus:outline-2 peer-focus:outline-offset-2 peer-focus:outline-foreground"
            >
              {Array.from({ length: PIN_LENGTH }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "size-4 rounded-pill border-2",
                    index < pin.length
                      ? "border-text-primary bg-text-primary"
                      : "border-outline bg-surface-variant",
                  )}
                />
              ))}
            </label>
            {error ? (
              <p id={`${pinId}-error`} className="text-body text-error m-0" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPicked(null);
                setPin("");
                setError(null);
              }}
            >
              <ArrowLeft aria-hidden />
              Someone else
            </Button>
          </form>
        ) : null}

        <div className="flex flex-col items-center gap-3 border-t border-outline pt-4">
          <p className="text-caption text-text-muted m-0 max-w-prose">
            Use the keyboard. Switch person any time from the top bar. Every job shows who
            handled it.
            {load.kind === "ready" && load.accounts.length
              ? ` ${load.accounts.map((row) => row.name).join(", ")}: use your own login on your own phone or PC.`
              : ""}
          </p>
          <Button variant="ghost" onClick={() => void auth.signOut()}>
            <LogOut aria-hidden />
            Sign out of this PC
          </Button>
        </div>
      </div>
    </main>
  );
}
