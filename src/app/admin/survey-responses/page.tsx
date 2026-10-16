"use client";

import { Suspense } from "react";

import { SurveyDesk } from "@/components/survey-responses/SurveyDesk";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function AdminSurveyResponsesPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading survey responses…" />}>
      <SurveyDesk />
    </Suspense>
  );
}
