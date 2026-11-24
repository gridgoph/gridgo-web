"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { WeeklyHoursCard } from "@/app/supplier/shop-hours/_components/WeeklyHoursCard";
import { StepFrame, StepProblem, type StepAction } from "@/components/supplier-signup/StepFrame";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyShopHours, updateMyShopHours } from "@/lib/api/client";
import type { ShopHours } from "@/lib/api/types";
import { missionProgress } from "@/lib/guided-signup";
import { overridesFromDraft, schedulePatch, weekFromDraft } from "@/lib/shop-hours";
import { shopHoursErrorMessage } from "@/lib/shop-hours-errors";

/**
 * "Your hours" in guided setup: the shop's own weekly-hours card, the same
 * one on Shop hours, saved through `PATCH /me/shop-hours`.
 *
 * GRIDGO counts the step done once the shop saves a week, and until then it
 * draws its usual hours, so "Use these hours" saves them as they stand (the
 * shop app added the same button). While the week is being edited the card's
 * own save is the one yellow button, and this one steps aside.
 */
export function SetupHours({
  stepOpen,
  onSaved,
  back,
  next,
}: {
  /** GRIDGO still has the hours step open (`nextStep: "hours"`). */
  stepOpen: boolean;
  onSaved: () => void;
  back?: StepAction | null;
  next?: StepAction | null;
}) {
  const [hours, setHours] = useState<ShopHours | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setHours(await getMyShopHours());
    } catch (err) {
      setLoadError(shopHoursErrorMessage(err, "shop", "Your shop hours did not load."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(change: Parameters<typeof schedulePatch>[1]): Promise<string | null> {
    if (!hours) return "Your shop hours are still loading.";
    setSaving(true);
    try {
      const { patch } = schedulePatch(hours, change, Date.now());
      setHours(await updateMyShopHours(hours.version, patch));
      onSaved();
      return null;
    } catch (err) {
      return shopHoursErrorMessage(err, "shop", "Your hours were not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveUsualHours() {
    setError(null);
    const refused = await send({});
    if (refused) setError(refused);
  }

  const showUse = stepOpen && !editing && hours;

  return (
    <StepFrame
      progress={missionProgress("hours").label}
      title="Your hours"
      lede="GRIDGO sends jobs only while you are open, and times each job on these hours."
      problem={error ? <StepProblem>{error}</StepProblem> : null}
      back={back}
      next={
        showUse
          ? {
              label: saving ? "Saving…" : "Use these hours",
              hint: "Gamita kini nga oras",
              onClick: () => void saveUsualHours(),
              disabled: saving,
              testId: "use-these-hours",
            }
          : editing
            ? null
            : next
      }
    >
      {hours ? (
        <WeeklyHoursCard
          hours={hours}
          now={now}
          saving={saving}
          onEditingChange={setEditing}
          onSave={(draft) => send({ week: weekFromDraft(draft), overrides: overridesFromDraft(draft) })}
        />
      ) : loadError ? (
        <StepProblem>{loadError}</StepProblem>
      ) : (
        <Skeleton className="h-96 w-full rounded-card" />
      )}
      <p className="text-caption m-0 text-text-muted">
        Closing dates, staying open later and closing for a while are on{" "}
        <Link href="/supplier/shop-hours" className="underline">
          Shop hours
        </Link>
        .
      </p>
    </StepFrame>
  );
}
