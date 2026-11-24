"use client";

import { useEffect, useState } from "react";

import { ChoiceList, TickRow } from "@/components/supplier-signup/controls";
import { StepFrame, StepProblem, type StepAction } from "@/components/supplier-signup/StepFrame";
import { Button } from "@/components/ui/button";
import { listSupplierLegalDocuments } from "@/lib/api/supplier-self";
import {
  JOBS_HANDLED_BY_OPTIONS,
  missionProgress,
  type JobsHandledBy,
} from "@/lib/guided-signup";
import type { LegalVersion } from "@/lib/supplier-legal";

/** The three documents a shop agrees to when it opens (gridgo-api legal.js). */
export const OPEN_SHOP_DOCUMENT_IDS = ["supplier-agreement", "terms-of-service", "privacy-notice"] as const;

export function openShopDocuments(documents: readonly LegalVersion[]): LegalVersion[] | null {
  const found = OPEN_SHOP_DOCUMENT_IDS.map((id) => documents.find((doc) => doc.documentId === id));
  return found.every(Boolean) ? (found as LegalVersion[]) : null;
}

export function agreementLabel(documents: readonly Pick<LegalVersion, "title">[] | null): string {
  const titles = documents?.map((doc) => doc.title) ?? [];
  const joined =
    titles.length > 1
      ? `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`
      : (titles[0] ?? "Terms of Service, Privacy Notice and Supplier Agreement");
  return `I am 18 or older and agree, for this shop, to the ${joined}`;
}

type Legal =
  | { status: "loading" }
  | { status: "ready"; documents: LegalVersion[] }
  /** This GRIDGO has no legal library: enrollment goes without it, as before. */
  | { status: "unsupported" }
  | { status: "failed" };

/**
 * Step 4: who takes jobs, and the moment the shop opens (the shop app's
 * `signup/open-shop`).
 *
 * GRIDGO needs this answer to open the shop, so the step that asks it is also
 * the step that agrees to the terms and opens the account. Everything typed
 * so far is already on GRIDGO; enrollment names the draft's version rather
 * than repeating it. Adding staff happens on the Team step once the shop
 * exists.
 */
export function OpenShopStep({
  jobsHandledBy,
  onJobsHandledByChange,
  onOpen,
  missing,
  back,
}: {
  jobsHandledBy: JobsHandledBy;
  onJobsHandledByChange: (value: JobsHandledBy) => void;
  /** Resolves to a refusal sentence, or null once the shop opened. */
  onOpen: (legal: { versionIds: string[]; marketing: boolean } | null) => Promise<string | null>;
  /** The earlier step still to finish, if any. */
  missing: string | null;
  back?: StepAction | null;
}) {
  const [legal, setLegal] = useState<Legal>({ status: "loading" });
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [consentProblem, setConsentProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLegal() {
    setLegal({ status: "loading" });
    try {
      const { documents } = await listSupplierLegalDocuments();
      setLegal({ status: "ready", documents });
    } catch (caught) {
      const status = (caught as { status?: number } | null)?.status;
      setLegal(status === 404 ? { status: "unsupported" } : { status: "failed" });
    }
  }

  useEffect(() => {
    void loadLegal();
  }, []);

  const documents = legal.status === "ready" ? openShopDocuments(legal.documents) : null;

  async function open() {
    setError(null);
    if (missing) {
      setError(`Finish "${missing}" first.`);
      return;
    }
    if (legal.status !== "unsupported" && (!documents || !agreed)) {
      setConsentProblem(true);
      return;
    }
    setBusy(true);
    const refused = await onOpen(
      documents ? { versionIds: documents.map((doc) => doc.id), marketing } : null,
    );
    setBusy(false);
    if (refused) {
      setError(refused);
      if (refused.includes("newer terms")) {
        setAgreed(false);
        void loadLegal();
      }
    }
  }

  return (
    <StepFrame
      progress={missionProgress("staff").label}
      title="Who takes jobs?"
      lede="Answer this and your shop opens. You add staff on a later step."
      problem={
        <>
          {consentProblem && !agreed ? <StepProblem>Tick the agreement below to open your shop.</StepProblem> : null}
          {error ? <StepProblem>{error}</StepProblem> : null}
        </>
      }
      back={back}
      next={{
        label: busy ? "Opening…" : "Open my shop",
        hint: "Ablihi akong tindahan",
        onClick: () => void open(),
        disabled: busy,
        testId: "open-shop",
      }}
    >
      <ChoiceList
        label="Who takes jobs?"
        options={JOBS_HANDLED_BY_OPTIONS}
        value={jobsHandledBy}
        onChange={onJobsHandledByChange}
        columns
      />
      <div className="gg-panel flex flex-col gap-1">
        <p className="text-body m-0 text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
          After you open
        </p>
        <p className="text-body m-0 text-text-secondary">Two short steps left: your hours, and where you get paid.</p>
      </div>

      {legal.status === "loading" ? (
        <p className="text-body m-0 text-text-muted" role="status">
          Loading GRIDGO&apos;s terms…
        </p>
      ) : legal.status === "failed" || (legal.status === "ready" && !documents) ? (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="text-body m-0 text-error">GRIDGO&apos;s terms did not load, so the shop cannot open yet.</p>
          <Button variant="outline" onClick={() => void loadLegal()}>
            Try again
          </Button>
        </div>
      ) : documents ? (
        <div className="flex flex-col gap-3" data-testid="open-shop-consent">
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {documents.map((doc) => (
              <li key={doc.id}>
                <details className="rounded-field border border-outline bg-surface px-3 py-2">
                  <summary className="text-body flex min-h-11 cursor-pointer items-center text-text-primary">
                    Read the {doc.title}
                  </summary>
                  <div className="text-body max-h-72 overflow-y-auto whitespace-pre-wrap pb-2 text-text-secondary">
                    {doc.text}
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <TickRow
            checked={agreed}
            onChange={(value) => {
              setAgreed(value);
              setConsentProblem(false);
            }}
            label={agreementLabel(documents)}
            hint="Required. GRIDGO records which versions you agreed to, and when."
            disabled={busy}
            testId="open-shop-agree"
          />
          <TickRow
            checked={marketing}
            onChange={setMarketing}
            label="Send me GRIDGO news and offers for shops"
            hint="Optional. Leave it unticked and nothing changes about your shop."
            disabled={busy}
          />
        </div>
      ) : null}
    </StepFrame>
  );
}
