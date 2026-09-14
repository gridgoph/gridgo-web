"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { ServiceLines } from "@/components/approvals/ServiceLines";
import { SignupApprovals } from "@/components/approvals/SignupApprovals";
import { reviewQueueTab } from "@/components/approvals/review-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function OpsApprovalsBody() {
  const tab = reviewQueueTab(useSearchParams());
  return (
    <Tabs defaultValue={tab} key={tab}>
      <TabsList>
        <TabsTrigger value="signups">Sign-ups</TabsTrigger>
        <TabsTrigger value="services">Service lines</TabsTrigger>
      </TabsList>

      <TabsContent value="signups" className="mt-4">
        <SignupApprovals />
      </TabsContent>

      <TabsContent value="services" className="mt-4">
        <ServiceLines />
      </TabsContent>
    </Tabs>
  );
}

export default function OpsApprovalsPage() {
  return (
    <Suspense>
      <OpsApprovalsBody />
    </Suspense>
  );
}
