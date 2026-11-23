"use client";

import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { SupplierPayoutSettings } from "@/components/settings/SupplierPayoutSettings";
import { TeamManager } from "@/components/shop-team/TeamManager";
import { useShopVerification } from "@/components/shop-verification/useShopVerification";
import { JobAlertsCard } from "@/components/supplier-signup/setup/JobAlertsCard";
import { OwnerClaimCard } from "@/components/supplier-signup/setup/OwnerClaimCard";
import { SetupHours } from "@/components/supplier-signup/setup/SetupHours";
import { StepFrame, type StepAction } from "@/components/supplier-signup/StepFrame";
import { StepRail } from "@/components/supplier-signup/StepRail";
import { WizardShell } from "@/components/supplier-signup/WizardShell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { addSamplePhotos, attachSignupLogo, loadShopSignup } from "@/lib/api/supplier-signup";
import { useShopAccess } from "@/lib/auth/shop-access";
import {
  currentMission,
  missionById,
  missionProgress,
  missionStates,
  setupComplete,
  type GuidedSignup,
  type MissionId,
  type PayoutStatus,
} from "@/lib/guided-signup";
import { takeSignupLogo } from "@/lib/signup-logo";
import { useSupplierDesktop } from "@/lib/useSupplierDesktop";

export const READY_PATH = "/supplier/setup/ready";

/** The steps that live inside the shop's portal, after it opens. */
export const SETUP_MISSIONS: readonly MissionId[] = ["hours", "staff", "paid", "verify"];

type Load =
  | { kind: "loading" }
  | { kind: "ready"; signup: GuidedSignup; payoutStatus: PayoutStatus | null }
  /** A shop that did not use guided sign-up, or an API without it. */
  | { kind: "none" }
  | { kind: "failed"; message: string };

/** The step to open when nothing is asked for: GRIDGO's next unfinished one. */
export function setupLanding(signup: GuidedSignup): MissionId | null {
  const next = currentMission(signup);
  if (next && SETUP_MISSIONS.includes(next.id)) return next.id;
  return null;
}

export function parseSetupStep(value: string | null): MissionId | null {
  return value && (SETUP_MISSIONS as readonly string[]).includes(value) ? (value as MissionId) : null;
}

/**
 * `/supplier/setup`: the rest of guided sign-up once the shop exists
 * (gridgoph/gridgo-web#328): hours, who takes jobs (the team), where GRIDGO
 * pays and job alerts, and the optional verification. Every step is a piece
 * the portal already has, framed with the same step list as `/signup`.
 *
 * Permissions are the shop app's: only the Owner sees payouts; a Manager
 * sets hours and staff and, on the payout step, sends the owner the claim
 * link. Staff never reach this page (`shopStaffAllowsPath`).
 */
export function SetupWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const desktop = useSupplierDesktop();
  const { can, manager } = useShopAccess();
  const owner = can.money;
  const verification = useShopVerification();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [active, setActive] = useState<MissionId | null>(parseSetupStep(params.get("step")));
  const picked = useRef(Boolean(active));
  const photosTried = useRef(false);

  const reload = useCallback(async () => {
    const read = await loadShopSignup();
    if (read.status === "not_open_yet" || (read.status === "ok" && !read.signup)) {
      setLoad({ kind: "none" });
      return null;
    }
    if (read.status === "failed") {
      setLoad({ kind: "failed", message: read.message });
      return null;
    }
    const signup = read.signup as GuidedSignup;
    setLoad({ kind: "ready", signup, payoutStatus: read.payoutStatus });
    return signup;
  }, []);

  useEffect(() => {
    void (async () => {
      // The logo picked before the shop existed, now that it can own it.
      const logo = takeSignupLogo();
      if (logo) await attachSignupLogo(logo);
      const signup = await reload();
      if (!signup) return;
      if (!picked.current && desktop) setActive(setupLanding(signup));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first read only
  }, []);

  // GRIDGO's last step is the portal's own: a sample photo on each listing.
  useEffect(() => {
    if (load.kind !== "ready" || load.signup.nextStep !== "listing_photos" || photosTried.current) return;
    photosTried.current = true;
    void addSamplePhotos().then((added) => {
      if (added) void reload();
    });
  }, [load, reload]);

  /** After a save: read again and move to the next unfinished step. */
  const advance = useCallback(async () => {
    const signup = await reload();
    if (!signup) return;
    const next = setupLanding(signup);
    setActive(desktop ? next : null);
  }, [desktop, reload]);

  if (load.kind === "loading") return <LoadingBlock label="Loading your setup…" />;
  if (load.kind === "failed") {
    return (
      <ErrorState
        title="Your setup did not load"
        body={load.message}
        action={
          <Button variant="secondary" onClick={() => void reload()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (load.kind === "none") {
    return (
      <EmptyState
        title="Nothing to set up here"
        body="Your shop was set up before the step-by-step setup. Hours, team and payouts are on My shop."
        action={
          <Button variant="secondary" nativeButton={false} render={<Link href="/supplier/my-shop" />}>
            Open My shop
          </Button>
        }
      />
    );
  }

  const { signup } = load;
  const states = missionStates(signup);
  const complete = setupComplete(signup);
  const verified = verification.state.kind === "ready" && verification.state.read.verification.verified;
  const next = currentMission(signup);

  function open(id: MissionId) {
    if (!SETUP_MISSIONS.includes(id)) return;
    setActive(id);
    router.replace(`/supplier/setup?step=${id}`, { scroll: false });
  }

  function navFrom(id: MissionId): { back: StepAction | null; next: StepAction } {
    const index = SETUP_MISSIONS.indexOf(id);
    const previous = index > 0 ? SETUP_MISSIONS[index - 1] : null;
    const following = SETUP_MISSIONS[index + 1] ?? null;
    return {
      back: previous
        ? { label: `Back: ${missionById(previous).title}`, hint: "Balik", onClick: () => open(previous) }
        : null,
      next:
        complete || !following
          ? { label: "Finish", hint: "Human na", onClick: () => router.push(READY_PATH), testId: "setup-finish" }
          : { label: `Next: ${missionById(following).title}`, hint: "Padayon", onClick: () => open(following) },
    };
  }

  let step: React.ReactNode = null;
  if (active === "hours") {
    const nav = navFrom("hours");
    step = <SetupHours stepOpen={states.hours !== "done"} onSaved={() => void advance()} back={nav.back} next={nav.next} />;
  } else if (active === "staff") {
    const nav = navFrom("staff");
    step = (
      <StepFrame
        progress={missionProgress("staff").label}
        title="Who takes jobs"
        lede="Add the people who print with you. Each gets their own sign-in or a PIN on this computer."
        back={nav.back}
        next={{ ...nav.next, quiet: true }}
      >
        <TeamManager />
      </StepFrame>
    );
  } else if (active === "paid") {
    const nav = navFrom("paid");
    step = owner ? (
      <StepFrame
        progress={missionProgress("paid").label}
        title="Get paid and alerts"
        lede="Where GRIDGO sends your money, and how you hear about new jobs."
        back={nav.back}
        next={states.paid === "done" ? { ...nav.next, quiet: true } : null}
      >
        <SupplierPayoutSettings setup onSaved={() => void advance()} after={<JobAlertsCard />} />
      </StepFrame>
    ) : (
      <StepFrame
        progress={missionProgress("paid").label}
        title="Get paid and alerts"
        lede="Only the owner sets where GRIDGO pays. Jobs come in meanwhile."
        back={nav.back}
        next={nav.next}
      >
        {manager && signup.nextStep === "owner_claim" ? <OwnerClaimCard /> : null}
        <JobAlertsCard />
      </StepFrame>
    );
  } else if (active === "verify") {
    const nav = navFrom("verify");
    step = (
      <StepFrame
        progress={missionProgress("verify").label}
        title="Verify your shop"
        lede="Optional today. A verified shop is paid without the starting limit."
        back={nav.back}
        next={{ label: "Finish", hint: "Human na", onClick: () => router.push(READY_PATH), testId: "setup-finish" }}
      >
        {verified ? (
          <p className="text-body m-0 flex items-center gap-2 text-text-primary">
            <BadgeCheck aria-hidden className="size-5 text-success" /> Your shop is verified.
          </p>
        ) : owner ? (
          <Button variant="outline" className="self-start" nativeButton={false} render={<Link href="/supplier/documents" />}>
            Open Get verified
          </Button>
        ) : (
          <p className="text-body m-0 text-text-secondary">The owner sends the papers from Get verified.</p>
        )}
      </StepFrame>
    );
  }

  const continueId = next && SETUP_MISSIONS.includes(next.id) ? next.id : null;

  return (
    <WizardShell
      heading={complete ? "Your shop is set up" : "Finish setting up your shop"}
      lede={
        complete
          ? "Every step is done. Change any of them here or on My shop."
          : "GRIDGO saved what you did so far. Pick up at the next step."
      }
      rail={
        <StepRail
          signup={signup}
          active={active}
          onOpen={open}
          verified={verified}
          verifyOpen
        />
      }
      step={step}
      onShowSteps={() => setActive(null)}
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="h-auto min-h-12 py-1.5"
          onClick={() => (continueId ? open(continueId) : router.push(READY_PATH))}
          data-testid="missions-continue"
        >
          <span className="flex flex-col items-center leading-tight">
            <span>{continueId ? `Continue: ${missionById(continueId).title}` : "Finish"}</span>
            <span className="text-caption opacity-75" lang="ceb">
              {continueId ? "Padayon" : "Human na"}
            </span>
          </span>
        </Button>
      }
    />
  );
}
