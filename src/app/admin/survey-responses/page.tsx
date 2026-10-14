"use client";

import { Suspense } from "react";

import { SurveyResponsesDesk } from "@/components/survey-responses/SurveyResponsesDesk";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function AdminSurveyResponsesPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading survey responses…" />}>
      <SurveyResponsesDesk />
    </Suspense>
  );
}
