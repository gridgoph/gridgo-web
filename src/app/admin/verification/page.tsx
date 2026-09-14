"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { ServiceLines } from "@/components/approvals/ServiceLines";
import { SignupApprovals } from "@/components/approvals/SignupApprovals";
import { reviewQueueTab } from "@/components/approvals/review-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Accreditation has two halves: the account itself, and the catalogue lines it
 * offers. The account queue is the same surface Operations works from — one
 * implementation, mounted here too — so the two can never drift apart.
 */
function AdminVerificationBody() {
  const tab = reviewQueueTab(useSearchParams());
  return (
    <Tabs defaultValue={tab} key={tab}>
      <TabsList>
        <TabsTrigger value="signups">Sign-ups</TabsTrigger>
        <TabsTrigger value="services">Service lines</TabsTrigger>
      </TabsList>

      <TabsContent value="signups" className="mt-4">
        <SignupApprovals intro="Suppliers and riders sign themselves up and can be given no work until they are approved. Approving an account does not make its catalogue lines live — those are verified on the Service lines tab." />
      </TabsContent>

      <TabsContent value="services" className="mt-4">
        <ServiceLines />
      </TabsContent>
    </Tabs>
  );
}

export default function AdminVerificationPage() {
  return (
    <Suspense>
      <AdminVerificationBody />
    </Suspense>
  );
}
