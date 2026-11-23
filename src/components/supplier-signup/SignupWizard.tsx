"use client";

import { SignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { StepRail } from "@/components/supplier-signup/StepRail";
import { StepFrame, type StepAction } from "@/components/supplier-signup/StepFrame";
import { OpenShopStep } from "@/components/supplier-signup/steps/OpenShopStep";
import { PinStep } from "@/components/supplier-signup/steps/PinStep";
import { PrintsStep } from "@/components/supplier-signup/steps/PrintsStep";
import { ShopStep } from "@/components/supplier-signup/steps/ShopStep";
import { StartStep } from "@/components/supplier-signup/steps/StartStep";
import { WizardShell } from "@/components/supplier-signup/WizardShell";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { isApiError } from "@/lib/api/client";
import {
  enrollGuidedSupplier,
  loadGuidedSignup,
  saveSignupStep,
  type SignupDraftStep,
} from "@/lib/api/supplier-signup";
import { useAuth } from "@/lib/auth/AuthProvider";
import { preferredPortalRole } from "@/lib/auth/portal-access";
import { supplierWebDeviceId } from "@/lib/device-id";
import {
  currentMission,
  DRAFT_MISSIONS,
  EMPTY_ELIGIBILITY,
  eligibilityFrom,
  eligibilityProblems,
  eligibilityValue,
  isManagerSignup,
  missionById,
  missionStates,
  readyToEnroll,
  shopFieldsFrom,
  type Eligibility,
  type GuidedSignup,
  type JobsHandledBy,
  type MissionId,
  type ShopFields,
  type SignupTerms,
} from "@/lib/guided-signup";
import {
  clearSignupLocal,
  enrollmentKey,
  patchSignupLocal,
  readSignupLocal,
} from "@/lib/signup-local";
import { holdSignupLogo } from "@/lib/signup-logo";
import { useSupplierDesktop } from "@/lib/useSupplierDesktop";

export const SIGNUP_PATH = "/signup";
export const SETUP_PATH = "/supplier/setup";

type Phase =
  | { kind: "checking" }
  /** Signed out: step 0, then creating the account. */
  | { kind: "start" }
  | { kind: "account" }
  /** Signed in, nothing saved yet: step 0 for this account. */
  | { kind: "start_signed_in" }
  | { kind: "wizard" }
  | { kind: "not_open" }
  | { kind: "failed"; message: string }
  /** This account already has portal access that is not a shop. */
  | { kind: "has_portal" }
  | { kind: "opening" };

type Active = MissionId | "start";

const STALE_ONCE = "Your sign-up changed in another window. It is up to date now; press again.";

/** The refusals "Open my shop" can meet, in the shop's words. */
export function enrollRefusal(error: unknown): string {
  if (!isApiError(error)) return "GRIDGO did not answer, so your shop did not open. Check your connection and try again.";
  switch (error.code) {
    case "legal_version_changed":
    case "legal_consent_required":
    case "invalid_legal_versions":
      return "GRIDGO has newer terms than the ones on this screen. Read them again, tick the box, then open your shop.";
    case "supplier_signup_incomplete":
      return "Finish the earlier steps first.";
    case "supplier_signup_stale":
      return STALE_ONCE;
    case "application_exists":
    case "supplier_application_exists":
      return "This account already applied for a shop. Sign in to the portal to see it.";
    default:
      if (error.kind === "server") return "GRIDGO did not answer, so your shop did not open. Try again in a moment.";
      return "GRIDGO could not open your shop. Check the earlier steps, or ask Operations to help.";
  }
}

/**
 * `/signup`: a print shop opens on GRIDGO from a computer
 * (gridgoph/gridgo-web#328), with the same steps, words and calls as the
 * shop app's guided sign-up (gridgoph/gridgo-supplier#286).
 *
 * Supplier only: there is no role to pick, and enrollment creates a shop and
 * nothing else. Before the account exists it asks step 0, then Clerk makes
 * the account; after that GRIDGO holds the draft, so leaving and coming back
 * reopens the first step GRIDGO says is unfinished. Once the shop opens the
 * same steps continue inside the supplier portal at `/supplier/setup`.
 */
export function SignupWizard() {
  const auth = useAuth();
  const router = useRouter();
  const desktop = useSupplierDesktop();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [signup, setSignup] = useState<GuidedSignup | null>(null);
  const [terms, setTerms] = useState<SignupTerms | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility>(EMPTY_ELIGIBILITY);
  const [startError, setStartError] = useState<string | null>(null);
  const [startBusy, setStartBusy] = useState(false);
  const [shopFields, setShopFields] = useState<ShopFields>(shopFieldsFrom(undefined));
  const [logo, setLogo] = useState<File | null>(null);
  const [jobsHandledBy, setJobsHandledBy] = useState<JobsHandledBy>("just_me");
  const [active, setActive] = useState<Active | null>(null);
  const signupRef = useRef<GuidedSignup | null>(null);
  signupRef.current = signup;
  const checked = useRef(false);

  const goToSetup = useCallback(async () => {
    setPhase({ kind: "opening" });
    clearSignupLocal();
    await auth.refresh();
    router.replace(SETUP_PATH);
  }, [auth, router]);

  /** Where to land: the first step GRIDGO says is unfinished. */
  const landOn = useCallback((next: GuidedSignup) => {
    const mission = currentMission(next);
    return mission && DRAFT_MISSIONS.includes(mission.id) ? mission.id : "staff";
  }, []);

  const adopt = useCallback(
    (next: GuidedSignup, nextTerms: SignupTerms) => {
      setSignup(next);
      setTerms(nextTerms);
      if (next.steps.shop) setShopFields((current) => (current.shopName ? current : shopFieldsFrom(next.steps.shop)));
      const saved = eligibilityFrom(next.steps.eligibility);
      if (saved) setEligibility(saved);
    },
    [],
  );

  // Who is here, and where their sign-up stands.
  useEffect(() => {
    if (auth.status === "checking" || checked.current) return;
    const local = readSignupLocal();
    if (local.eligibility) setEligibility(local.eligibility);
    if (local.jobsHandledBy) setJobsHandledBy(local.jobsHandledBy);
    if (auth.status === "signed_out") {
      checked.current = true;
      setPhase({ kind: "start" });
      return;
    }
    if (auth.status === "unavailable") return;
    checked.current = true;
    const portal = auth.status === "mapped" ? preferredPortalRole(auth.memberships) : null;
    if (portal === "supplier") {
      router.replace(SETUP_PATH);
      return;
    }
    if (portal) {
      setPhase({ kind: "has_portal" });
      return;
    }
    void (async () => {
      const read = await loadGuidedSignup();
      if (read.status === "not_open_yet") {
        setPhase({ kind: "not_open" });
        return;
      }
      if (read.status === "failed") {
        setPhase({ kind: "failed", message: read.message });
        checked.current = false;
        return;
      }
      if (read.signup.supplierId) {
        await goToSetup();
        return;
      }
      adopt(read.signup, read.terms);
      if (read.signup.steps.eligibility) {
        setActive(landOn(read.signup));
        setPhase({ kind: "wizard" });
        return;
      }
      // Step 0 answered before the account existed: GRIDGO saves it now.
      const answered = local.eligibility && eligibilityValue(local.eligibility);
      if (answered) {
        const saved = await saveSignupStep(read.signup.version, "eligibility", answered);
        if (saved.status === "ok") {
          adopt(saved.signup, saved.terms);
          setActive(landOn(saved.signup));
          setPhase({ kind: "wizard" });
          return;
        }
      }
      setPhase({ kind: "start_signed_in" });
    })();
  }, [adopt, auth.memberships, auth.status, goToSetup, landOn, router]);

  /** Save one step; a stale version reads again and tries once more with the same answer. */
  async function save(step: SignupDraftStep, value: Record<string, unknown>): Promise<string | null> {
    let result = await saveSignupStep(signupRef.current?.version ?? 0, step, value);
    if (result.status === "stale") {
      const read = await loadGuidedSignup();
      if (read.status === "ok") {
        adopt(read.signup, read.terms);
        result = await saveSignupStep(read.signup.version, step, value);
      }
    }
    if (result.status === "ok") {
      adopt(result.signup, result.terms);
      if (step !== "eligibility") setActive(desktop ? landOn(result.signup) : null);
      return null;
    }
    if (result.status === "enrolled") {
      await goToSetup();
      return null;
    }
    if (result.status === "stale") return STALE_ONCE;
    return result.message;
  }

  async function startSignedIn() {
    const value = eligibilityValue(eligibility);
    if (!value) return;
    patchSignupLocal({ eligibility });
    setStartBusy(true);
    setStartError(null);
    const refused = await save("eligibility", value);
    setStartBusy(false);
    if (refused) {
      setStartError(refused);
      return;
    }
    const next = signupRef.current;
    if (next) setActive(landOn(next));
    setPhase({ kind: "wizard" });
  }

  async function openShop(legal: { versionIds: string[]; marketing: boolean } | null): Promise<string | null> {
    const current = signupRef.current;
    if (!current || !readyToEnroll(current)) return "Finish the earlier steps first.";
    const local = readSignupLocal();
    const key = enrollmentKey(local.enrollKey);
    patchSignupLocal({ enrollKey: key, jobsHandledBy });
    try {
      await enrollGuidedSupplier(
        {
          signupVersion: current.version,
          jobsHandledBy,
          ...(legal
            ? {
                legalConsentVersion: 1 as const,
                legalConsent: {
                  accepted: true as const,
                  versionIds: legal.versionIds,
                  method: "checkbox" as const,
                  junior: false as const,
                  marketing: legal.marketing,
                  app: "gridgo-web/supplier",
                  device: supplierWebDeviceId(),
                },
              }
            : {}),
        },
        key,
      );
    } catch (error) {
      if (isApiError(error) && (error.code === "legal_version_changed" || error.code === "legal_consent_required")) {
        patchSignupLocal({ enrollKey: undefined });
      }
      if (isApiError(error) && error.code === "supplier_signup_stale") {
        const read = await loadGuidedSignup();
        if (read.status === "ok") adopt(read.signup, read.terms);
        patchSignupLocal({ enrollKey: undefined });
      }
      return enrollRefusal(error);
    }
    holdSignupLogo(logo);
    await goToSetup();
    return null;
  }

  const signOut = (
    <Button variant="ghost" size="sm" onClick={() => void auth.signOut({ redirectUrl: SIGNUP_PATH })}>
      Sign out
    </Button>
  );

  if (phase.kind === "checking" || phase.kind === "opening") {
    return (
      <Centered>
        <LoadingBlock label={phase.kind === "opening" ? "Opening your shop…" : "Checking your sign-up…"} />
      </Centered>
    );
  }

  if (phase.kind === "start" || phase.kind === "start_signed_in") {
    const signedOut = phase.kind === "start";
    return (
      <Centered headerEnd={signedOut ? null : signOut}>
        <StartStep
          value={eligibility}
          onChange={(next) => {
            setEligibility(next);
            setStartError(null);
          }}
          busy={startBusy}
          error={startError}
          onStart={() => {
            if (!signedOut) {
              void startSignedIn();
              return;
            }
            patchSignupLocal({ eligibility });
            setPhase({ kind: "account" });
          }}
          secondary={
            signedOut ? (
              <Button
                variant="ghost"
                nativeButton={false}
                onClick={() =>
                  window.location.assign(
                    `/login?redirect_url=${encodeURIComponent(`${window.location.origin}${SIGNUP_PATH}`)}`,
                  )
                }
              >
                I already have an account
              </Button>
            ) : null
          }
        />
      </Centered>
    );
  }

  if (phase.kind === "account") {
    return (
      <Centered>
        <StepFrame
          progress="Takes 1 min"
          title="Your sign-in"
          lede="Your email and a password. We email you a code to confirm it."
          back={{ label: "Back", hint: "Balik", onClick: () => setPhase({ kind: "start" }) }}
        >
          <div className="flex justify-center" data-testid="clerk-sign-up">
            <SignUp
              routing="hash"
              forceRedirectUrl={SIGNUP_PATH}
              signInUrl={`/login?redirect_url=${encodeURIComponent(SIGNUP_PATH)}`}
            />
          </div>
        </StepFrame>
      </Centered>
    );
  }

  if (phase.kind === "not_open") {
    return (
      <Centered headerEnd={signOut}>
        <Notice
          title="Shop sign-up is not open on the web yet"
          body="Set up your shop in the GRIDGO Supplier app for now, or ask GRIDGO Operations to help."
        />
      </Centered>
    );
  }

  if (phase.kind === "has_portal") {
    return (
      <Centered headerEnd={signOut}>
        <Notice
          title="This account already uses the GRIDGO portal"
          body="To open a print shop, sign out and create a separate account for the shop."
          action={
            <Button variant="primary" nativeButton={false} onClick={() => window.location.assign("/")}>
              Go to the portal
            </Button>
          }
        />
      </Centered>
    );
  }

  if (phase.kind === "failed") {
    return (
      <Centered headerEnd={signOut}>
        <Notice
          title="Your sign-up did not load"
          body={phase.message}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Try again
            </Button>
          }
        />
      </Centered>
    );
  }

  // The wizard.
  const states = missionStates(signup);
  const manager = isManagerSignup(signup);
  const next = currentMission(signup);
  const openable = (id: MissionId) => DRAFT_MISSIONS.includes(id) && states[id as keyof typeof states] !== "later";

  function open(id: MissionId) {
    if (openable(id)) setActive(id);
  }

  /** Back goes to the step before; from "Your shop" it is step 0. */
  function backFrom(id: MissionId): StepAction {
    const index = DRAFT_MISSIONS.indexOf(id);
    const previous = index > 0 ? DRAFT_MISSIONS[index - 1] : null;
    return {
      label: previous ? `Back: ${missionById(previous).title}` : "Back",
      hint: "Balik",
      onClick: () => setActive(previous ?? "start"),
    };
  }

  const missingForOpen = (() => {
    const first = currentMission(signup);
    return first && first.id !== "staff" ? first.title : null;
  })();

  let step: React.ReactNode = null;
  if (active === "start") {
    step = (
      <StartStep
        value={eligibility}
        onChange={setEligibility}
        roleLocked={Boolean(signup?.steps.shop)}
        busy={startBusy}
        error={startError}
        onStart={() => {
          const value = eligibilityValue(eligibility);
          if (!value || Object.keys(eligibilityProblems(eligibility)).length) return;
          setStartBusy(true);
          setStartError(null);
          void save("eligibility", value).then((refused) => {
            setStartBusy(false);
            if (refused) setStartError(refused);
            else setActive("shop");
          });
        }}
      />
    );
  } else if (active === "shop") {
    step = (
      <ShopStep
        fields={shopFields}
        onFieldsChange={setShopFields}
        manager={manager}
        logo={logo}
        onLogoChange={setLogo}
        onSave={(value) => save("shop", value)}
        back={backFrom("shop")}
        onSkip={() => setActive(signup?.steps.location ? "prints" : "pin")}
      />
    );
  } else if (active === "pin" && terms) {
    step = (
      <PinStep
        saved={signup?.steps.location}
        wording={terms.locationConsentWording}
        onSave={(value) => save("location", value)}
        back={backFrom("pin")}
      />
    );
  } else if (active === "prints" && terms) {
    step = (
      <PrintsStep
        saved={signup?.steps.prints}
        terms={terms}
        onSave={(value) => save("prints", value)}
        back={backFrom("prints")}
      />
    );
  } else if (active === "staff") {
    step = (
      <OpenShopStep
        jobsHandledBy={jobsHandledBy}
        onJobsHandledByChange={(value) => {
          setJobsHandledBy(value);
          patchSignupLocal({ jobsHandledBy: value });
        }}
        onOpen={openShop}
        missing={missingForOpen}
        back={backFrom("staff")}
      />
    );
  }

  return (
    <WizardShell
      standalone
      headerEnd={signOut}
      heading="Set up your shop in 5 minutes"
      lede="Six short steps. Finish them and your shop can take jobs today."
      rail={
        <StepRail
          signup={signup}
          active={active === "start" ? null : active}
          onOpen={open}
          verifyOpen={false}
        />
      }
      step={step}
      onShowSteps={() => setActive(null)}
      footer={
        next && DRAFT_MISSIONS.includes(next.id) ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="h-auto min-h-12 py-1.5"
            onClick={() => setActive(next.id)}
            data-testid="missions-continue"
          >
            <span className="flex flex-col items-center leading-tight">
              <span>{`Continue: ${next.title}`}</span>
              <span className="text-caption opacity-75" lang="ceb">
                Padayon
              </span>
            </span>
          </Button>
        ) : null
      }
    />
  );
}

function Centered({ children, headerEnd }: { children: React.ReactNode; headerEnd?: React.ReactNode }) {
  return (
    <WizardShell standalone heading="" lede="" rail={null} step={null} headerEnd={headerEnd} footer={null} centered={children} />
  );
}

function Notice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-start gap-3" aria-labelledby="signup-notice">
      <h1 id="signup-notice" className="text-h2 m-0 text-text-primary">
        {title}
      </h1>
      <p className="text-body-lg m-0 text-text-secondary">{body}</p>
      {action}
    </section>
  );
}
