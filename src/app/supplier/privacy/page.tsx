"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { createMyPrivacyRequest, listMyPrivacyRequests } from "@/lib/api/supplier-self";
import {
  DELETION_ROW,
  PRIVACY_KINDS,
  RETENTION_NOTE,
  privacyKindTitle,
  privacyStatusLabel,
  type PrivacyRequest,
} from "@/lib/supplier-legal";

export default function SupplierPrivacyPage() {
  const [requests, setRequests] = useState<PrivacyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState("");
  const [correction, setCorrection] = useState("");
  const [sending, setSending] = useState<"access" | "correction" | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function load() {
    try {
      const answer = await listMyPrivacyRequests();
      setRequests(answer.requests ?? []);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && (caught.status === 404 || caught.status === 405)
          ? "GRIDGO is not taking privacy requests on this connection yet."
          : "Your requests did not load.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function send(kind: "access" | "correction") {
    const details = kind === "access" ? access : correction;
    if (kind === "correction" && !details.trim()) {
      setError("Say what GRIDGO should correct.");
      return;
    }
    setSending(kind);
    setError(null);
    try {
      await createMyPrivacyRequest(kind, details);
      if (kind === "access") setAccess("");
      else setCorrection("");
      setSent(PRIVACY_KINDS[kind].title);
      await load();
    } catch {
      setError("Your request did not reach GRIDGO. What you wrote is still here.");
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="flex max-w-prose flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-h2 text-text-primary m-0">Your data</h2>
        <p className="text-body text-text-secondary m-0">
          Each of these sends a request to GRIDGO&apos;s Operations team. They check it is you, do it by hand, and
          tell you here when it is done.
        </p>
      </header>
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p className="text-body text-text-primary m-0" role="status">
          {sent} was sent. GRIDGO will answer as soon as it can.
        </p>
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send("access");
        }}
      >
        <h3 className="text-body text-text-primary m-0">{PRIVACY_KINDS.access.title}</h3>
        <p className="text-body text-text-secondary m-0">{PRIVACY_KINDS.access.explain}</p>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-text-muted">{PRIVACY_KINDS.access.detailsLabel}</span>
          <Textarea value={access} onChange={(event) => setAccess(event.target.value)} />
        </label>
        <Button type="submit" disabled={sending != null}>
          {sending === "access" ? "Sending…" : "Send request"}
        </Button>
      </form>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send("correction");
        }}
      >
        <h3 className="text-body text-text-primary m-0">{PRIVACY_KINDS.correction.title}</h3>
        <p className="text-body text-text-secondary m-0">{PRIVACY_KINDS.correction.explain}</p>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-text-muted">{PRIVACY_KINDS.correction.detailsLabel}</span>
          <Textarea value={correction} onChange={(event) => setCorrection(event.target.value)} required />
        </label>
        <Button type="submit" disabled={sending != null}>
          {sending === "correction" ? "Sending…" : "Send request"}
        </Button>
      </form>

      <section className="flex flex-col gap-2">
        <h3 className="text-body text-text-primary m-0">{DELETION_ROW.title}</h3>
        <p className="text-body text-text-secondary m-0">{DELETION_ROW.detail}</p>
        <p className="text-body text-text-secondary m-0">{RETENTION_NOTE}</p>
        <Link href="/supplier/privacy/delete" className="text-body text-text-primary underline">
          Delete my account
        </Link>
      </section>

      <section className="flex flex-col gap-2" aria-label="Request history">
        <h3 className="text-overline text-text-muted m-0 uppercase">History</h3>
        {requests == null ? <p className="text-body text-text-muted m-0">Loading your requests.</p> : null}
        {requests?.length === 0 ? <p className="text-body text-text-secondary m-0">No requests yet.</p> : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {requests?.map((request) => (
            <li key={request.id} className="text-body text-text-secondary">
              {privacyKindTitle(request.kind)} — {privacyStatusLabel(request.status)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
