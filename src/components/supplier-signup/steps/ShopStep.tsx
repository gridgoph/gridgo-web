"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { BadgeCheck, ImagePlus, MessageSquareOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TextField } from "@/components/supplier-signup/controls";
import { StepFrame, StepProblem, type StepAction } from "@/components/supplier-signup/StepFrame";
import { Button } from "@/components/ui/button";
import {
  clerkPhoneNumbersEnabled,
  confirmPhoneCode,
  isVerifiedPhone,
  resendPhoneCode,
  startPhoneConfirm,
  type ClerkPhoneNumber,
  type ClerkPhoneUser,
} from "@/lib/clerk-phone";
import {
  missionProgress,
  philippineMobile,
  shopProblems,
  shopValue,
  type ShopFields,
} from "@/lib/guided-signup";

/**
 * Step 1: your shop (the shop app's `signup/your-shop`).
 *
 * The mobile is confirmed here with a texted code because GRIDGO checks it on
 * Clerk's record, not on what was typed: riders and Operations call this
 * number. A manager also names the owner's mobile, which is where the owner's
 * claim link is tied; it grants nothing by itself.
 *
 * When this Clerk does not text codes at all, the step says so plainly and
 * lets the shop go on with the pin and prints, which GRIDGO saves without it;
 * "Your shop" stays the one step left, never a dead end.
 */
export function ShopStep({
  fields,
  onFieldsChange,
  manager,
  logo,
  onLogoChange,
  onSave,
  back,
  onSkip,
}: {
  fields: ShopFields;
  onFieldsChange: (fields: ShopFields) => void;
  manager: boolean;
  logo: File | null;
  onLogoChange: (file: File | null) => void;
  /** Resolves to a refusal sentence, or null once GRIDGO saved the step. */
  onSave: (value: Record<string, unknown>) => Promise<string | null>;
  back?: StepAction | null;
  /** Texting is off: go on to the next step without saving this one. */
  onSkip: () => void;
}) {
  const { user } = useUser();
  const clerk = useClerk();
  const clerkUser = user as unknown as ClerkPhoneUser | null;
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<ClerkPhoneNumber | null>(null);
  const [code, setCode] = useState("");
  const [confirmedNow, setConfirmedNow] = useState<string | null>(null);
  const [phoneOff, setPhoneOff] = useState(() => clerkPhoneNumbersEnabled(clerk) === false);
  const codeRef = useRef<HTMLInputElement | null>(null);

  const mobile = philippineMobile(fields.phone);
  const phoneConfirmed = Boolean(mobile && (confirmedNow === mobile || isVerifiedPhone(clerkUser, mobile)));
  const problems = shopProblems(fields, { manager, phoneConfirmed });
  const problem = (field: keyof ShopFields) => (showProblems ? (problems[field] ?? null) : null);
  const logoUrl = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => (logoUrl ? URL.revokeObjectURL(logoUrl) : undefined), [logoUrl]);
  useEffect(() => {
    if (codeFor) codeRef.current?.focus();
  }, [codeFor]);

  function edit(next: Partial<ShopFields>) {
    onFieldsChange({ ...fields, ...next });
    if (next.phone !== undefined) setConfirmedNow(null);
  }

  async function sendCode() {
    setError(null);
    if (!mobile || !clerkUser) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    const started = await startPhoneConfirm(clerkUser, mobile);
    setBusy(false);
    if (started.status === "verified") setConfirmedNow(mobile);
    else if (started.status === "code_sent") {
      setCode("");
      setCodeFor(started.phone);
    } else if (started.status === "unavailable") setPhoneOff(true);
    else setError(started.message);
  }

  async function confirm() {
    if (!codeFor || !clerkUser) return;
    if (code.replace(/\D/g, "").length < 6) {
      setError("Enter the six digits from the text.");
      return;
    }
    setBusy(true);
    const refused = await confirmPhoneCode(clerkUser, codeFor, code);
    setBusy(false);
    if (refused) {
      setError(refused);
      return;
    }
    setError(null);
    setConfirmedNow(codeFor.phoneNumber);
    setCodeFor(null);
  }

  async function save() {
    setError(null);
    if (Object.keys(problems).length) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    const refused = await onSave(shopValue(fields, manager));
    setBusy(false);
    if (refused) setError(refused);
  }

  if (codeFor) {
    return (
      <StepFrame
        progress={missionProgress("shop").label}
        title="Enter the code"
        lede={`We texted a six-digit code to ${fields.phone.trim()}.`}
        problem={error ? <StepProblem>{error}</StepProblem> : null}
        back={{ label: "Change the number", hint: "Usba ang numero", onClick: () => setCodeFor(null) }}
        next={{ label: busy ? "Checking…" : "Confirm number", hint: "Kumpirma", onClick: () => void confirm(), disabled: busy }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            Code
          </span>
          <input
            ref={codeRef}
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void confirm();
            }}
            className="text-h2 h-14 w-48 rounded-field border border-input bg-surface px-4 tracking-[0.3em] tabular-nums"
            data-testid="phone-code"
          />
        </label>
        <Button
          variant="link"
          className="self-start"
          disabled={busy}
          onClick={() => void resendPhoneCode(codeFor).then(setError)}
        >
          Send another code
        </Button>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      progress={missionProgress("shop").label}
      title="Your shop"
      lede="What clients and riders see, and the number they call."
      problem={error ? <StepProblem>{error}</StepProblem> : null}
      back={back}
      next={
        phoneOff
          ? { label: "Next: Pin your shop", hint: "Sunod", onClick: onSkip, testId: "shop-skip" }
          : { label: busy ? "Saving…" : "Save and continue", hint: "I-save", onClick: () => void save(), disabled: busy }
      }
    >
      <label className="flex cursor-pointer items-center gap-3 self-start">
        <span className="flex size-16 items-center justify-center overflow-hidden rounded-card border border-outline bg-surface-variant">
          {logoUrl ? (
            // A local preview of a picked file; next/image cannot read a blob URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-16 object-cover" />
          ) : (
            <ImagePlus aria-hidden className="size-6 text-text-muted" />
          )}
        </span>
        <span className="flex flex-col">
          <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
            {logo ? "Change logo" : "Add your logo"}
          </span>
          <span className="text-caption text-text-muted">Optional. You can add it later.</span>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={logo ? "Change your shop logo" : "Add your shop logo"}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (file) onLogoChange(file);
          }}
        />
      </label>

      <div className="grid gap-6 md:grid-cols-2">
        <TextField
          label="Shop name"
          value={fields.shopName}
          onChange={(shopName) => edit({ shopName })}
          placeholder="Your shop's name"
          autoComplete="organization"
          error={problem("shopName")}
        />
        <TextField
          label="Your name"
          value={fields.contactName}
          onChange={(contactName) => edit({ contactName })}
          placeholder="First and last name"
          autoComplete="name"
          error={problem("contactName")}
        />
      </div>

      <div className="flex flex-col gap-3">
        <TextField
          label="Your mobile"
          value={fields.phone}
          onChange={(phone) => edit({ phone })}
          placeholder="0917 123 4567"
          inputMode="tel"
          autoComplete="tel"
          hint={phoneConfirmed ? undefined : "We text you a code to confirm it."}
          error={problem("phone")}
          testId="shop-phone"
        />
        {phoneConfirmed ? (
          <p className="text-caption m-0 flex items-center gap-2 text-success" data-testid="phone-confirmed">
            <BadgeCheck aria-hidden className="size-4" />
            Number confirmed
          </p>
        ) : phoneOff ? (
          <div className="gg-panel flex items-start gap-3" role="status" data-testid="phone-off">
            <MessageSquareOff aria-hidden className="mt-0.5 size-5 shrink-0 text-text-muted" />
            <div className="flex flex-col gap-1">
              <p className="text-body m-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                GRIDGO cannot text codes yet
              </p>
              <p className="text-body m-0 text-text-secondary">
                Confirming your mobile is switched off for now. Go on with your pin and what you print; they
                are saved. Come back to this step once texting is on, or ask Operations to help.
              </p>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="self-start"
            disabled={busy || !mobile}
            onClick={() => void sendCode()}
            data-testid="send-code"
          >
            Text me a code
          </Button>
        )}
      </div>

      {manager ? (
        <TextField
          label="Owner's mobile"
          value={fields.ownerPhone}
          onChange={(ownerPhone) => edit({ ownerPhone })}
          placeholder="0917 765 4321"
          inputMode="tel"
          hint="Your owner gets a link to claim the shop. It only works with this number."
          error={problem("ownerPhone")}
          testId="owner-phone"
        />
      ) : null}
    </StepFrame>
  );
}
