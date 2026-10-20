"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  attachVerificationDocument,
  getSupplierReadiness,
  uploadVerificationDocument,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

const PAPERS = [
  {
    kind: "business_permit",
    title: "Business permit",
    detail: "Your current Davao City mayor's permit, or the barangay permit if that is what you hold.",
  },
  {
    kind: "valid_id",
    title: "Valid ID of the owner",
    detail: "Any government ID with a photo, for the person named as the contact.",
  },
  {
    kind: "sample_work",
    title: "A photo of your work",
    detail: "One print you are proud of. Operations uses it to sanity-check what you ranked first.",
  },
] as const;

const STEP_HREF: Record<string, string> = {
  edit_profile: "/supplier/shop",
  open_shop: "/supplier/shop-hours",
  review_schedule: "/supplier/shop-hours",
  edit_services: "/supplier/services",
  edit_service: "/supplier/services",
  edit_service_formats: "/supplier/services",
  view_service: "/supplier/services",
  edit_listings: "/supplier/catalogue",
  edit_listing: "/supplier/catalogue",
  upload_listing_photo: "/supplier/catalogue",
  edit_listing_formats: "/supplier/catalogue",
  edit_listing_options: "/supplier/catalogue",
  view_listing_review: "/supplier/catalogue",
  activate_listing: "/supplier/catalogue",
  contact_operations: "/supplier/chat",
};

type Step = { code: string; message: string; action: string };
type PaperState = { status: "idle" | "sent" | "failed" | "closed"; detail: string };

function stepsFrom(body: unknown): Step[] {
  if (!body || typeof body !== "object") return [];
  const profile = (body as { profileCompletion?: { missing?: unknown } }).profileCompletion;
  if (!profile || !Array.isArray(profile.missing)) return [];
  return profile.missing.filter(
    (step): step is Step =>
      !!step &&
      typeof step === "object" &&
      typeof (step as Step).message === "string" &&
      typeof (step as Step).action === "string",
  );
}

export default function SupplierDocumentsPage() {
  const user = useAuth().user;
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [papers, setPapers] = useState<Record<string, PaperState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSteps(stepsFrom(await getSupplierReadiness()));
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 404 || err.status === 405)
          ? "Shop readiness is not open yet."
          : "Could not load what Operations still needs.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(kind: string, file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    setPapers((current) => ({ ...current, [kind]: { status: "idle", detail: "Sending…" } }));
    try {
      const uploaded = await uploadVerificationDocument(file);
      await attachVerificationDocument(uploaded.fileId, kind);
      setPapers((current) => ({
        ...current,
        [kind]: { status: "sent", detail: "Sent. Operations can open this file." },
      }));
    } catch (err) {
      const closed =
        err instanceof ApiError &&
        (err.status === 404 || err.status === 405 || err.code === "invalid_file_purpose");
      setPapers((current) => ({
        ...current,
        [kind]: {
          status: closed ? "closed" : "failed",
          detail: closed
            ? "Sending papers is not open yet. Nothing was counted as sent."
            : "GRIDGO did not get this file. Choose it again.",
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />;

  const approved = user?.verificationStatus === "approved";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-h2 text-text-primary m-0">Accreditation</h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Papers and the wait. A file counts as sent only after GRIDGO has stored it.
        </p>
      </header>
      {error ? <ErrorState body={error} action={<Button onClick={() => void load()}>Retry</Button>} /> : null}
      <section className="gg-card flex flex-col gap-2 p-3">
        <p className="text-body text-text-primary m-0">
          {approved
            ? "Operations has approved this shop."
            : "Operations has not approved this shop yet."}
        </p>
        {user?.verificationNote ? (
          <p className="text-body text-text-secondary m-0">From Operations: {user.verificationNote}</p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3" aria-label="Your papers">
        <h3 className="text-h3 text-text-primary m-0">Your papers</h3>
        {PAPERS.map((paper) => {
          const state = papers[paper.kind];
          return (
            <div key={paper.kind} className="gg-card flex flex-col gap-2 p-3">
              <h4 className="text-body text-text-primary m-0">{paper.title}</h4>
              <p className="text-caption text-text-muted m-0">{paper.detail}</p>
              <input
                type="file"
                aria-label={paper.title}
                disabled={busy === paper.kind}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void send(paper.kind, file);
                }}
              />
              {state ? (
                <p className="text-body text-text-secondary m-0" role="status">
                  {state.detail}
                </p>
              ) : (
                <p className="text-caption text-text-muted m-0">Nothing sent from this screen yet. Papers sent from the shop app are already with Operations.</p>
              )}
            </div>
          );
        })}
      </section>
      <section className="flex flex-col gap-2" aria-label="What can still move">
        <h3 className="text-h3 text-text-primary m-0">What can still move</h3>
        {steps.length === 0 && !error ? (
          <p className="text-body text-text-secondary m-0">Nothing else is listed for this shop.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {steps.map((step) => {
              const href = STEP_HREF[step.action];
              return (
                <li key={`${step.code}-${step.action}`} className="text-body text-text-primary">
                  {href ? <Link href={href}>{step.message}</Link> : step.message}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
