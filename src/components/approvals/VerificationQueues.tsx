"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ServiceLines } from "@/components/approvals/ServiceLines";
import { SignupApprovals } from "@/components/approvals/SignupApprovals";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Accreditation has two halves: the account itself, and the catalogue lines it
 * offers. The live pages mount ServiceLines and SignupApprovals directly so
 * tab URLs stay in each role tree; this wrapper remains the shared pair.
 */
export function VerificationQueues() {
  const params = useSearchParams();
  const requestedTab = params.get("tab") === "services" ? "services" : "signups";
  const [tab, setTab] = useState(requestedTab);
  useEffect(() => setTab(requestedTab), [requestedTab]);
  return (
    <Tabs value={tab} onValueChange={setTab}>
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
