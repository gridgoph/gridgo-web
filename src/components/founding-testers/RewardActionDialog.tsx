"use client";

/**
 * Super Admin voiding or resuming one tester reward
 * (`POST /admin/tester-rewards/:id/void|resume`, contract "Staff rewards and
 * actions" in gridgo-api docs/FOUNDING_TESTER_API.md). Both need a written
 * reason the audit log keeps. Voiding a referral voids both vouchers together
 * and frees no budget; resuming re-checks eligibility, budget and the abuse
 * checks, so the reward can stay paused or become blocked.
 */

import { useEffect, useId, useState } from "react";

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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { TesterReward } from "@/lib/api/types";
import {
  TESTER_REASON_MAX,
  rewardAmountText,
  rewardKindText,
} from "@/lib/tester-program";

export type RewardAction = "void" | "resume";

const COPY: Record<
  RewardAction,
  { title: string; label: string; placeholder: string; confirm: string; keep: string }
> = {
  void: {
    title: "Void this reward?",
    label: "Why it is being voided",
    placeholder: "e.g. The friend is the inviter's own second account.",
    confirm: "Void reward",
    keep: "Keep it",
  },
  resume: {
    title: "Resume this reward?",
    label: "Why it can go now",
    placeholder: "e.g. November budget approved.",
    confirm: "Resume reward",
    keep: "Leave it paused",
  },
};

function body(action: RewardAction, reward: TesterReward, who: string): string {
  const what = `${rewardKindText(reward)} reward for ${who}: ${rewardAmountText(reward)}.`;
  if (action === "resume") {
    return `${what} GRIDGO checks eligibility, the five steps, the monthly budget${reward.kind === "referral" ? " and the invite checks" : ""} again before issuing. With no room in the budget it stays paused${reward.kind === "referral" ? "; a new match blocks it for good" : ""}. A voucher issued now is valid 30 days from today.`;
  }
  if (reward.status === "paused") {
    return `${what} Nothing was issued yet; after voiding it can never be resumed. This cannot be undone.`;
  }
  return `${what} ${reward.kind === "referral" ? "Both unused vouchers, the friend's and the inviter's, are voided together." : "The unused voucher is voided."} A voucher already used on an order stays used; nobody is charged. Voiding frees no budget, and an earned Founding Tester label stays. This cannot be undone.`;
}

export function RewardActionDialog({
  target,
  who,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  target: { reward: TesterReward; action: RewardAction } | null;
  who: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  // Keyed on the reward and action, not the object: a reload while open keeps the reason.
  const key = target ? `${target.reward.id}:${target.action}` : null;
  useEffect(() => {
    if (key) setReason("");
  }, [key]);
  const text = reason.trim();
  const ready = text.length > 0 && reason.length <= TESTER_REASON_MAX;
  const copy = target ? COPY[target.action] : COPY.void;
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(next) => !next && !busy && onCancel()}
    >
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {target ? body(target.action, target.reward, who) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={`${id}-reason`}>{copy.label}</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={TESTER_REASON_MAX}
            value={reason}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            placeholder={copy.placeholder}
            onChange={(change) => setReason(change.target.value)}
          />
          <FieldDescription>
            Kept in the audit log. Operations and Super Admin are notified.
          </FieldDescription>
        </Field>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            {copy.keep}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={target?.action === "void" ? "destructive" : "primary"}
            disabled={busy || !ready}
            onClick={() => onConfirm(text)}
          >
            {busy ? "Saving…" : copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
