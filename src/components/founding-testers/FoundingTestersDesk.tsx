"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { FoundingTestersList } from "@/components/founding-testers/FoundingTestersList";
import { TesterInvitesList } from "@/components/founding-testers/TesterInvitesList";
import { TesterRewardsList } from "@/components/founding-testers/TesterRewardsList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPhp } from "@/lib/format";
import { MISSIONS } from "@/lib/founding-testers";
import { INVITE_A_FRIEND } from "@/lib/tester-program";

type DeskTab = "clients" | "rewards" | "invites";

function deskTab(value: string | null): DeskTab {
  return value === "rewards" || value === "invites" ? value : "clients";
}

/**
 * The Founding Testers page for Operations and Super Admin: every client's
 * five steps and invite counts, the rewards with their state and invite
 * checks, and the recorded sign-up form responses. The tab lives in the URL
 * (`?tab=rewards`) so an inbox notice can open it.
 */
export function FoundingTestersDesk({ tree }: { tree: "ops" | "admin" }) {
  const router = useRouter();
  const search = useSearchParams();
  const tab = deskTab(search.get("tab"));

  const go = useCallback(
    (next: DeskTab) => {
      router.replace(
        next === "clients"
          ? `/${tree}/founding-testers`
          : `/${tree}/founding-testers?tab=${next}`,
        { scroll: false },
      );
    },
    [router, tree],
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Client accounts work towards the Founding Tester label in five steps:{" "}
        {MISSIONS.map((m) => m.label.toLowerCase()).join(", ")}. Finishing all five adds
        the label and a {formatPhp(1500)} GRIDGO voucher valid 30 days, once per account.
        With &ldquo;{INVITE_A_FRIEND}&rdquo;, when a friend they invited finishes all
        five, both get a voucher too. GRIDGO counts this on its own. Share taps count
        each time a client opened the share sheet, with Share or &ldquo;Send to a
        friend&rdquo;; a tap is not a post, and earns nothing.
      </p>
      <Tabs value={tab} onValueChange={(value) => go(deskTab(String(value)))}>
        <TabsList>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>
        <TabsContent value="clients" className="mt-4">
          {tab === "clients" ? <FoundingTestersList tree={tree} /> : null}
        </TabsContent>
        <TabsContent value="rewards" className="mt-4">
          {tab === "rewards" ? <TesterRewardsList tree={tree} /> : null}
        </TabsContent>
        <TabsContent value="invites" className="mt-4">
          {tab === "invites" ? <TesterInvitesList /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
