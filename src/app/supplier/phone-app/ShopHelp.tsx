"use client";

import { useEffect, useRef, useState } from "react";

import { DO_NOT_PACK_YET } from "@/lib/shop-handover";
import { Button } from "@/components/ui/button";

const SLIDES = [
  {
    step: "01 / 03",
    title: "Jobs find your shop",
    body: "GRIDGO matches print work to your shop. Open the job, check its specification and ready-by, and answer before its displayed deadline. The answer window pauses across closed hours.",
  },
  {
    step: "02 / 03",
    title: "Produce and check it",
    body: `Follow the steps shown on the job. On rider-packs work, send photos of the finished, unpacked products for GRIDGO to review. ${DO_NOT_PACK_YET} Older jobs may ask for packing photos before pickup.`,
  },
  {
    step: "03 / 03",
    title: "Hand off and get paid",
    body: "The rider checks the items with you. On rider-packs jobs, pack in front of the rider after the check, then sign on their phone. Follow your payout stages on Payouts: filing proof does not release money; GRIDGO reviews and records the transfer.",
  },
] as const;

/**
 * The installed shop app and this website are different. This page explains
 * the website. It does not offer a native package update.
 */
export function ShopHelp() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const replay = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  useEffect(() => {
    if (!open && returning.current) {
      replay.current?.focus();
      returning.current = false;
    }
  }, [open]);

  return (
    <section
      className="gg-card flex max-w-prose flex-col gap-3"
      aria-labelledby="shop-help"
    >
      <h2 id="shop-help" className="text-h3 text-text-primary m-0">
        The shop app and this website
      </h2>
      <p className="text-body text-text-secondary m-0">
        The separate GRIDGO Supplier mobile app and this supplier website use your GRIDGO
        account for shop work. You can add this website to your Home Screen. Doing that
        keeps using the website; it does not install or update the separate mobile app.
      </p>
      {open ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-caption text-text-muted m-0">{slide.step}</p>
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {slide.title}
          </p>
          <p className="text-body text-text-secondary m-0">{slide.body}</p>
          <div className="flex gap-2">
            {step < SLIDES.length - 1 ? (
              <Button type="button" onClick={() => setStep((current) => current + 1)}>
                Next
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  returning.current = true;
                  setOpen(false);
                  setStep(0);
                }}
              >
                Done
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          ref={replay}
          variant="outline"
          onClick={() => {
            setStep(0);
            setOpen(true);
          }}
        >
          Replay the tour
        </Button>
      )}
    </section>
  );
}
