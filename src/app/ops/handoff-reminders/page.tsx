"use client";

import { Suspense } from "react";

import { HandoffReminders } from "@/components/riders/HandoffReminders";
import { SkeletonCards } from "@/components/ui/loading";

export default function OpsHandoffRemindersPage() {
  return (
    <Suspense
      fallback={
        <SkeletonCards
          count={2}
          lines={3}
          label="Loading handoff reminders"
          className="gap-3"
        />
      }
    >
      <HandoffReminders tree="ops" />
    </Suspense>
  );
}
