"use client";

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isApiError } from "@/lib/api/client";
import { createPinStaff, resetPinStaffPin } from "@/lib/api/shop-team";
import { shopTeamErrorCopy } from "@/lib/shop-team";

/** Exactly four numbers, leading zeroes kept. Mirrors `400 invalid_shop_pin`. */
export function validPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

/** What the two PIN fields say, before the API is asked. */
export function pinProblem(pin: string, again: string): string | null {
  if (!validPin(pin)) return "A PIN is exactly 4 numbers.";
  if (pin !== again) return "The two PINs are different. Type the same 4 numbers twice.";
  return null;
}

function PinFields({
  pin,
  again,
  onPin,
  onAgain,
  error,
  disabled,
}: {
  pin: string;
  again: string;
  onPin: (value: string) => void;
  onAgain: (value: string) => void;
  error: string | null;
  disabled: boolean;
}) {
  const id = useId();
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 4);
  return (
    <>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`${id}-pin`}>4-digit PIN</FieldLabel>
        <Input
          id={`${id}-pin`}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={pin}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onPin(digits(event.target.value))}
        />
        <FieldDescription>They type it on the shop PC to start working. Keep it to them.</FieldDescription>
      </Field>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`${id}-again`}>Type the PIN again</FieldLabel>
        <Input
          id={`${id}-again`}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={again}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onAgain(digits(event.target.value))}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    </>
  );
}

/**
 * Add someone without a phone or GRIDGO account: a name and a PIN they type
 * on the shop's own PC. Only the Owner may make a PIN person a Manager.
 */
export function AddPinStaffDialog({
  open,
  onOpenChange,
  canGrantManager,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canGrantManager: boolean;
  onAdded: (name: string) => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [jobAlerts, setJobAlerts] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A PIN never outlives its dialog.
  useEffect(() => {
    if (!open) {
      setName("");
      setPin("");
      setAgain("");
      setRole("staff");
      setJobAlerts(true);
      setNameError(null);
      setPinError(null);
      setError(null);
    }
  }, [open]);

  async function submit() {
    const trimmed = name.trim();
    const badName = !trimmed || trimmed.length > 100 ? "Enter their name, up to 100 letters." : null;
    const badPin = pinProblem(pin, again);
    setNameError(badName);
    setPinError(badPin);
    if (badName || badPin) return;
    setBusy(true);
    setError(null);
    try {
      await createPinStaff({ name: trimmed, pin, role, jobAlerts });
      setPin("");
      setAgain("");
      onAdded(trimmed);
      onOpenChange(false);
    } catch (caught) {
      setError(shopTeamErrorCopy(isApiError(caught) ? caught.code : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add with PIN</DialogTitle>
          <DialogDescription>
            For staff without a phone or GRIDGO account. They work only on this shop&rsquo;s PC, by
            PIN.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={nameError ? true : undefined}>
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={100}
                autoComplete="off"
                disabled={busy}
                aria-invalid={nameError ? true : undefined}
                onChange={(event) => setName(event.target.value)}
              />
              {nameError ? <FieldError>{nameError}</FieldError> : null}
            </Field>
            <PinFields
              pin={pin}
              again={again}
              onPin={setPin}
              onAgain={setAgain}
              error={pinError}
              disabled={busy}
            />
            {canGrantManager ? (
              <Field>
                <FieldLabel id={`${id}-role`}>Role</FieldLabel>
                <ToggleGroup
                  aria-labelledby={`${id}-role`}
                  value={[role]}
                  onValueChange={(value: string[]) => {
                    const next = value[0];
                    if (next === "staff" || next === "manager") setRole(next);
                  }}
                >
                  <ToggleGroupItem value="staff" variant="outline">
                    Staff
                  </ToggleGroupItem>
                  <ToggleGroupItem value="manager" variant="outline">
                    Manager
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  A Manager can also change hours, products and staff. Only you see Money.
                </FieldDescription>
              </Field>
            ) : null}
            <Field orientation="horizontal">
              <Switch
                id={`${id}-alerts`}
                checked={jobAlerts}
                disabled={busy}
                onCheckedChange={(next) => setJobAlerts(Boolean(next))}
              />
              <FieldLabel htmlFor={`${id}-alerts`}>Gets job alerts</FieldLabel>
            </Field>
            {error ? (
              <p className="text-body text-error m-0" role="alert">
                {error}
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Give a PIN person a new PIN. Any shop device they were picked on locks. */
export function NewPinDialog({
  person,
  onOpenChange,
  onDone,
}: {
  person: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onDone: (name: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPin("");
    setAgain("");
    setPinError(null);
    setError(null);
  }, [person]);

  async function submit() {
    if (!person) return;
    const bad = pinProblem(pin, again);
    setPinError(bad);
    if (bad) return;
    setBusy(true);
    setError(null);
    try {
      await resetPinStaffPin(person.id, pin);
      setPin("");
      setAgain("");
      onDone(person.name);
      onOpenChange(false);
    } catch (caught) {
      setError(shopTeamErrorCopy(isApiError(caught) ? caught.code : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={person !== null} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New PIN for {person?.name}</DialogTitle>
          <DialogDescription>
            The old PIN stops working at once. If they are working on a shop PC now, it locks.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            <PinFields
              pin={pin}
              again={again}
              onPin={setPin}
              onAgain={setAgain}
              error={pinError}
              disabled={busy}
            />
            {error ? (
              <p className="text-body text-error m-0" role="alert">
                {error}
              </p>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save new PIN"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
