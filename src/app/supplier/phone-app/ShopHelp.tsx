"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

const SLIDES = [
  {
    step: "01 / 03",
    title: "Jobs find your shop",
    body: "GRIDGO matches print work to your capacity. Accept or decline inside the SLA — no sales chase, no Messenger ping-pong.",
  },
  {
    step: "02 / 03",
    title: "Produce and check it",
    body: "Produce the approved spec, then pack and mark the job ready. When a rider arrives, run the six pickup checks together before handoff.",
  },
  {
    step: "03 / 03",
    title: "Hand off and get paid",
    body: "Stage the job for the rider, then track protected payment status as settlement clears.",
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

  return (
    <section className="gg-card flex max-w-prose flex-col gap-3" aria-labelledby="shop-help">
      <h2 id="shop-help" className="text-h3 text-text-primary m-0">
        The shop app and this website
      </h2>
      <p className="text-body text-text-secondary m-0">
        The installed GRIDGO Supplier app is the phone app. This page is the supplier website, which you can add to
        a home screen. They do the same shop work. This website does not install or update the phone app.
      </p>
      {open ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-caption text-text-muted m-0">{slide.step}</p>
          <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
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
