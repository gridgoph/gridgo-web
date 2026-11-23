"use client";

import { useState } from "react";

import { ChoiceList, TickRow } from "@/components/supplier-signup/controls";
import { StepFrame, StepProblem } from "@/components/supplier-signup/StepFrame";
import {
  eligibilityProblems,
  ROLE_OPTIONS,
  SHOP_KIND_OPTIONS,
  type Eligibility,
} from "@/lib/guided-signup";

/**
 * Step 0: three answers before anything else (the shop app's `signup/start`).
 *
 * Asked before an account exists, so nobody under 18 is asked for an email
 * first. A manager learns here, once, that the owner claims the shop and
 * sets where GRIDGO pays.
 */
export function StartStep({
  value,
  onChange,
  onStart,
  busy = false,
  error,
  roleLocked = false,
  secondary,
}: {
  value: Eligibility;
  onChange: (next: Eligibility) => void;
  onStart: () => void;
  busy?: boolean;
  error?: string | null;
  /** GRIDGO already has the contact details: owner or manager is fixed. */
  roleLocked?: boolean;
  secondary?: React.ReactNode;
}) {
  const [showProblems, setShowProblems] = useState(false);
  const problems = eligibilityProblems(value);
  const problem = (field: keyof Eligibility) => (showProblems ? (problems[field] ?? null) : null);

  function start() {
    if (Object.keys(problems).length) {
      setShowProblems(true);
      return;
    }
    onStart();
  }

  return (
    <StepFrame
      progress="Takes 30 sec"
      title="Tell us about you"
      lede="Three quick answers. Then your shop is about 5 minutes away."
      problem={error ? <StepProblem>{error}</StepProblem> : null}
      aside={secondary}
      next={{ label: busy ? "Saving…" : "Start", hint: "Sugdi na", onClick: start, disabled: busy, testId: "start-next" }}
    >
      <ChoiceList
        label="Where do you print?"
        options={SHOP_KIND_OPTIONS}
        value={value.shopKind}
        onChange={(shopKind) => onChange({ ...value, shopKind })}
        error={problem("shopKind")}
        columns
      />
      <div className="flex flex-col gap-2">
        <ChoiceList
          label="Are you the owner?"
          options={ROLE_OPTIONS}
          value={value.registrantRole}
          onChange={(registrantRole) => onChange({ ...value, registrantRole })}
          error={problem("registrantRole")}
          disabled={roleLocked}
          columns
        />
        {roleLocked ? (
          <p className="text-caption m-0 text-text-muted">
            Saved with your shop&apos;s details. To change it, ask Operations to restart your sign-up.
          </p>
        ) : value.registrantRole === "manager" ? (
          <p className="text-caption m-0 text-text-muted">
            You set up the shop. Your owner gets a link to claim it and sets where GRIDGO pays.
          </p>
        ) : null}
      </div>
      <TickRow
        checked={value.adult}
        onChange={(adult) => onChange({ ...value, adult })}
        label="I am 18 or older"
        hint="18 anyos pataas ko"
        error={problem("adult")}
        testId="adult"
      />
    </StepFrame>
  );
}
