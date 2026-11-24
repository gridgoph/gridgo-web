"use client";

import { useState } from "react";

import { TextField, TickRow } from "@/components/supplier-signup/controls";
import { PinPicker } from "@/components/supplier-signup/PinPicker";
import { StepFrame, StepProblem, type StepAction } from "@/components/supplier-signup/StepFrame";
import {
  locationValue,
  missionProgress,
  PIN_CONSEQUENCE,
  pinStepProblem,
  type SignupSteps,
} from "@/lib/guided-signup";

/**
 * Step 2: the pin, and the one consent it needs (the shop app's `signup/pin`).
 *
 * The consent is GRIDGO's own sentence, drawn and sent back word for word:
 * GRIDGO stores the wording with the time it received it and refuses any
 * other wording. The tick sits right above the action, never below the map.
 */
export function PinStep({
  saved,
  wording,
  onSave,
  back,
}: {
  saved: SignupSteps["location"] | undefined;
  wording: string;
  onSave: (value: Record<string, unknown>) => Promise<string | null>;
  back?: StepAction | null;
}) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    saved?.point ? { lat: saved.point.lat, lng: saved.point.lng } : null,
  );
  const [label, setLabel] = useState(saved?.point?.label ?? "");
  const [consented, setConsented] = useState(Boolean(saved));
  const [showProblem, setShowProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = pinStepProblem(pin, label, consented);

  async function save() {
    setError(null);
    if (problem || !pin) {
      setShowProblem(true);
      return;
    }
    setBusy(true);
    const refused = await onSave(locationValue(pin, label, wording));
    setBusy(false);
    if (refused) setError(refused);
  }

  const shown = error ?? (showProblem ? problem : null);

  return (
    <StepFrame
      progress={missionProgress("pin").label}
      title="Pin your shop"
      lede="Riders come to this pin, and delivery fees start here."
      problem={
        <>
          {wording ? (
            <TickRow
              checked={consented}
              onChange={setConsented}
              label={wording}
              testId="location-consent"
            />
          ) : null}
          {shown ? <StepProblem>{shown}</StepProblem> : null}
        </>
      }
      back={back}
      next={{ label: busy ? "Saving…" : "Use this pin", hint: "Gamita kini", onClick: () => void save(), disabled: busy }}
    >
      <PinPicker pin={pin} onChange={setPin} />
      <p className="text-caption m-0 text-text-muted">{PIN_CONSEQUENCE}</p>
      <TextField
        label="Address at the pin"
        value={label}
        onChange={setLabel}
        placeholder="Street, building and landmark"
        autoComplete="street-address"
        hint="What a rider would recognise at your door."
        testId="pin-label"
      />
    </StepFrame>
  );
}
