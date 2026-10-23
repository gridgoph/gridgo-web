"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSupplierLegal } from "@/app/supplier/_components/SupplierLegalGate";
import { SkeletonCards } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { gateBody, gateHeading, libraryOrder, penaltyNote } from "@/lib/supplier-legal";

export default function SupplierLegalReviewPage() {
  const router = useRouter();
  const { pending, accepting, accept, status } = useSupplierLegal();
  const versionIds = pending.map((doc) => doc.id);
  const signature = versionIds.join("|");
  const [agreedTo, setAgreedTo] = useState<string | null>(null);
  const [nudged, setNudged] = useState(false);
  const agreed = agreedTo === signature && pending.length > 0;
  const money = pending.map(penaltyNote).find(Boolean) ?? null;

  async function agree() {
    if (!agreed) {
      setNudged(true);
      return;
    }
    const done = await accept(versionIds);
    if (done) router.replace("/supplier/dashboard");
  }

  if (status === "unknown")
    return <SkeletonCards count={2} lines={2} label="Checking terms" />;
  if (status === "unavailable") return null;
  if (status === "unsupported")
    return (
      <p className="text-body text-text-primary">
        Agreements are not available on this connection yet.
      </p>
    );

  if (status === "clear" && pending.length === 0) {
    return (
      <div className="flex max-w-prose flex-col gap-3">
        <h2 className="text-h2 text-text-primary m-0">Nothing to agree to</h2>
        <p className="text-body text-text-secondary m-0">
          Your shop has agreed to the terms GRIDGO is asking for.
        </p>
        <Link href="/supplier/legal" className="text-body text-text-primary underline">
          Read the documents
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-prose flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-h2 text-text-primary m-0">{gateHeading(pending)}</h2>
        <p className="text-body text-text-secondary m-0">{gateBody(pending)}</p>
      </header>
      <section className="flex flex-col gap-2" aria-label="Needs your agreement">
        <h3 className="text-overline text-text-muted m-0 uppercase">
          Needs your agreement
        </h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {libraryOrder(pending).map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/supplier/legal/${doc.id}`}
                className="text-body text-text-primary underline"
              >
                {doc.title}
              </Link>
              {doc.changeSummary ? (
                <p className="text-caption text-text-secondary m-0">
                  {doc.changeSummary}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {money ? <p className="text-body text-text-secondary m-0">{money}</p> : null}
      <label className="flex min-h-11 items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={agreed}
          onChange={(event) => setAgreedTo(event.target.checked ? signature : null)}
        />
        <span className="text-body text-text-primary">
          I have read these and I agree.
        </span>
      </label>
      {nudged && !agreed ? (
        <p className="text-body text-error m-0" role="alert">
          Tick the box to agree.
        </p>
      ) : null}
      <Button
        type="button"
        onClick={() => void agree()}
        disabled={accepting || pending.length === 0}
      >
        {accepting ? "Sending…" : "Agree and continue"}
      </Button>
      <Link href="/supplier/privacy" className="text-body text-text-primary underline">
        Your data
      </Link>
    </div>
  );
}
