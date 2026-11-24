"use client";

import { Check, Hourglass } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings, getSupplierReadiness } from "@/lib/api/client";
import { useShopAccess } from "@/lib/auth/shop-access";
import { howYouEarnLines, shopReadyForJobs } from "@/lib/how-you-earn";
import { cn } from "@/lib/utils";

/**
 * The finish line of guided setup (the shop app's `setup-ready`), centred.
 *
 * "Ready for jobs" is said only when GRIDGO's readiness says matching can
 * use the shop. Until then the moment is still a finish, and it says what
 * GRIDGO is checking. "How you earn" is the Owner's, from GRIDGO's schedule.
 */
export function SetupReady() {
  const { can } = useShopAccess();
  const owner = can.money;
  const [ready, setReady] = useState<boolean | null>(null);
  const [lines, setLines] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void getSupplierReadiness()
      .then((body) => live && setReady(shopReadyForJobs(body) === true))
      .catch(() => live && setReady(false));
    if (owner) {
      void getSettings()
        .then((settings) => live && setLines(howYouEarnLines(settings.shopMoney)))
        .catch(() => live && setLines(null));
    }
    return () => {
      live = false;
    };
  }, [owner]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 py-8 text-center md:py-12">
      <div className="flex flex-col items-center gap-4">
        <span
          aria-hidden
          className={cn(
            "flex size-24 items-center justify-center rounded-pill motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300",
            ready ? "bg-success text-canvas" : "bg-action-yellow text-action-yellow-on",
          )}
        >
          {ready === false ? <Hourglass className="size-10" strokeWidth={2} /> : <Check className="size-12" strokeWidth={3} />}
        </span>
        <h1 className="text-display m-0 text-text-primary" data-testid="ready-title">
          {ready ? "Ready for jobs" : "Your shop is set up"}
        </h1>
        <p className="text-body-lg m-0 text-text-secondary">
          {ready
            ? "Jobs that fit your shop come to To do. Accept them within the hour."
            : "GRIDGO is checking your shop and listings. Jobs start once they are approved, usually within a working day."}
        </p>
      </div>

      {owner ? (
        lines === undefined ? (
          <Skeleton className="h-32 w-full rounded-card" />
        ) : lines ? (
          <section className="gg-panel flex w-full flex-col gap-2 text-left" data-testid="how-you-earn" aria-labelledby="how-you-earn">
            <h2 id="how-you-earn" className="text-body m-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
              How you earn
            </h2>
            <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
              {lines.map((line) => (
                <li key={line} className="text-body text-text-secondary">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ) : null
      ) : null}

      <Button
        variant="primary"
        size="lg"
        className="h-auto min-h-12 min-w-64 py-1.5"
        nativeButton={false}
        render={<Link href="/supplier/dashboard" data-testid="ready-go" />}
      >
        <span className="flex flex-col items-center leading-tight">
          <span>Go to To do</span>
          <span className="text-caption opacity-75" lang="ceb">
            Adto sa To do
          </span>
        </span>
      </Button>
    </div>
  );
}
