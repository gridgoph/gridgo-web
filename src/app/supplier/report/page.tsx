"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uploadSupportChatImage } from "@/lib/api/client";
import { sendSupportChatMessage } from "@/lib/api/support-chat-party";
import { PROBLEM_REPORT_MAX, composeProblemReport, problemReportIssue, readBrowserContext } from "@/lib/problem-report";

function ReportForm() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("orderId")?.trim() || null;
  const title = params.get("title")?.trim() || null;
  const context = useMemo(() => readBrowserContext(), []);
  const [what, setWhat] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issue = problemReportIssue(what);

  async function send() {
    if (issue) {
      setError(issue);
      return;
    }
    setSending(true);
    setError(null);
    const fileIds: string[] = [];
    try {
      for (const file of files.slice(0, 3)) {
        const stored = await uploadSupportChatImage(file);
        fileIds.push(stored.fileId);
      }
    } catch {
      setError("A screenshot did not upload, so nothing was sent. What you wrote is still here.");
      setSending(false);
      return;
    }
    try {
      const body = composeProblemReport({
        what,
        job: orderId ? { orderId, title } : null,
        context,
      });
      const posted = await sendSupportChatMessage(body, undefined, fileIds, { newThread: true });
      router.replace(`/supplier/chat?thread=${encodeURIComponent(posted.thread.id)}`);
    } catch {
      setError("The report did not send. What you wrote is still here.");
      setSending(false);
    }
  }

  return (
    <form
      className="flex max-w-prose flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <h2 className="text-h2 text-text-primary m-0">Report a problem</h2>
      {title ? <p className="text-body text-text-secondary m-0">{title}</p> : null}
      <p className="text-body text-text-secondary m-0">
        {orderId
          ? "Tell Operations what went wrong with this job. It opens a new chat with them, and they reply there."
          : "Tell Operations what went wrong. It opens a new chat with them, and they reply there."}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-muted">What went wrong</span>
        <Textarea
          value={what}
          maxLength={PROBLEM_REPORT_MAX}
          aria-label="What went wrong"
          onChange={(event) => setWhat(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-muted">Screenshots (optional, up to 3)</span>
        <input
          type="file"
          accept="image/*"
          multiple
          aria-label="Screenshots"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))}
        />
      </label>
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={sending}>
        {sending ? "Sending…" : "Send to Operations"}
      </Button>
    </form>
  );
}

export default function SupplierReportPage() {
  return (
    <Suspense fallback={null}>
      <ReportForm />
    </Suspense>
  );
}
