"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, useUser } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMyPrivacyRequest } from "@/lib/api/supplier-self";
import {
  DELETION_NO_SESSION,
  DELETION_REQUEST_FAILED,
  confirmWithCode,
  confirmWithPassword,
  deletionConfirmMethod,
  sendDeletionCode,
  type ReverifySession,
} from "@/lib/account-deletion";
import { RETENTION_NOTE } from "@/lib/supplier-legal";

export default function SupplierDeleteAccountPage() {
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const method = deletionConfirmMethod(user);
  const [secret, setSecret] = useState("");
  const [codeSent, setCodeSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!session) {
      setError(DELETION_NO_SESSION);
      return;
    }
    const reverification = session as unknown as ReverifySession;
    setBusy(true);
    setError(null);
    try {
      const confirmed =
        method === "password"
          ? await confirmWithPassword(reverification, secret)
          : await confirmWithCode(reverification, secret);
      if (confirmed.status !== "ok") {
        setError(confirmed.message);
        return;
      }
      await createMyPrivacyRequest("deletion");
      setSecret("");
      setSent(true);
    } catch {
      setError(DELETION_REQUEST_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function emailCode() {
    if (!session) {
      setError(DELETION_NO_SESSION);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await sendDeletionCode(session as unknown as ReverifySession);
    setBusy(false);
    if (result.status === "failed") setError(result.message);
    else setCodeSent(result.destination || "your sign-in email");
  }

  if (isLoaded && !user) {
    return <p className="text-body text-text-primary m-0">{DELETION_NO_SESSION}</p>;
  }

  if (sent) {
    return (
      <div className="flex max-w-prose flex-col gap-3" role="status">
        <h2 className="text-h2 text-text-primary m-0">Request sent</h2>
        <p className="text-body text-text-secondary m-0">
          Operations process it by hand. Your account stays available while the request is reviewed.
        </p>
        <p className="text-body text-text-secondary m-0">{RETENTION_NOTE}</p>
        <Link href="/supplier/privacy" className="text-body text-text-primary underline">
          Your data
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex max-w-prose flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-h2 text-text-primary m-0">Delete my account</h2>
      <p className="text-body text-text-secondary m-0">
        GRIDGO checks it is you, then Operations delete the account by hand. Nothing is deleted from this page.
      </p>
      <p className="text-body text-text-secondary m-0">{RETENTION_NOTE}</p>
      {method === "email_code" ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void emailCode()}>
          Email me a code
        </Button>
      ) : null}
      {codeSent ? <p className="text-body text-text-secondary m-0">Code sent to {codeSent}.</p> : null}
      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-muted">
          {method === "password" ? "Password" : "6-digit code"}
        </span>
        <Input
          type={method === "password" ? "password" : "text"}
          inputMode={method === "password" ? undefined : "numeric"}
          autoComplete={method === "password" ? "current-password" : "one-time-code"}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          aria-label={method === "password" ? "Password" : "Email code"}
        />
      </label>
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Checking…" : "Send deletion request"}
      </Button>
    </form>
  );
}
