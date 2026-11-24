"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { FileAudio, FileText, ImageIcon, Loader2, X } from "lucide-react";

import { FlowAction } from "@/components/product-templates/supplier/FlowParts";
import { RequestList } from "@/components/product-templates/supplier/RequestList";
import { templateErrorMessage } from "@/components/product-templates/supplier/errors";
import { useSetupRequests } from "@/components/product-templates/supplier/useSetupRequests";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  createProductSetupRequest,
  uploadProductSetupFile,
} from "@/lib/api/product-templates";
import {
  REQUEST_MESSAGE_MAX,
  SETUP_FILE_ACCEPT,
  SETUP_FILE_MAX_BYTES,
  SETUP_FILES_MAX,
} from "@/lib/product-templates";
import { uploadErrorMessage } from "@/lib/upload-errors";

type Upload = {
  key: string;
  name: string;
  type: string;
  state: "sending" | "ready" | "failed";
  fileId: string | null;
  error: string | null;
};

function FileGlyph({ type }: { type: string }) {
  if (type.startsWith("audio/")) return <FileAudio className="size-5" aria-hidden />;
  if (type.startsWith("image/")) return <ImageIcon className="size-5" aria-hidden />;
  return <FileText className="size-5" aria-hidden />;
}

/**
 * "Let GRIDGO set it up" (gridgo-supplier#268). For a shop that would rather
 * not type: send a photo of the price list on the wall, a PDF, a voice note,
 * or just a message. The GRIDGO team fills in the products, and each comes
 * back as "Prices to confirm": nothing goes live until the shop confirms it.
 * The files are private to the shop and the GRIDGO team.
 */
export default function SetupHelpPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const { requests, reload } = useSetupRequests("setup");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const busy = uploads.some((u) => u.state === "sending");
  const ready = uploads.filter((u) => u.state === "ready" && u.fileId);
  const room = SETUP_FILES_MAX - uploads.length;
  const problem = busy
    ? "Wait for your files to finish sending."
    : !ready.length && !message.trim()
      ? "Add a photo of your price list, a voice note, or a message."
      : null;

  function patch(key: string, next: Partial<Upload>) {
    setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...next } : u)));
  }

  async function sendFile(key: string, file: File) {
    if (file.size > SETUP_FILE_MAX_BYTES) {
      patch(key, {
        state: "failed",
        error: "Larger than 20 MB. Choose a smaller file or a lower-resolution photo.",
      });
      return;
    }
    try {
      const stored = await uploadProductSetupFile(file);
      patch(key, { state: "ready", fileId: stored.fileId });
    } catch (err) {
      patch(key, {
        state: "failed",
        error: uploadErrorMessage(err, { what: "this file" }),
      });
    }
  }

  function pick(files: FileList | null) {
    if (!files) return;
    const chosen = [...files].slice(0, Math.max(0, room));
    const added = chosen.map((file, index) => ({
      file,
      upload: {
        key: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
        type: file.type,
        state: "sending" as const,
        fileId: null,
        error: null,
      },
    }));
    setUploads((current) => [...current, ...added.map((a) => a.upload)]);
    for (const { file, upload } of added) void sendFile(upload.key, file);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function send() {
    if (problem) {
      setTried(true);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await createProductSetupRequest({
        kind: "setup",
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(ready.length ? { fileIds: ready.map((u) => u.fileId!) } : {}),
      });
      setSent(true);
      setMessage("");
      setUploads([]);
      setTried(false);
      void reload();
    } catch (err) {
      setError(templateErrorMessage(err, "This was not sent to the GRIDGO team."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 text-text-primary m-0">Let GRIDGO set it up</h1>
        <p className="text-body text-text-secondary m-0">
          Send your price list. The GRIDGO team adds your products and prices, then you
          check them. Nothing goes live until you confirm.
        </p>
      </div>

      {sent ? (
        <div
          className="rounded-card border border-outline bg-surface-variant flex flex-col gap-2 p-3"
          role="status"
          data-testid="setup-sent"
        >
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Sent to the GRIDGO team
          </p>
          <p className="text-body text-text-secondary m-0">
            We tell you when your products are ready to check. They stay hidden until you
            confirm the prices.
          </p>
          <Button
            className="self-start"
            nativeButton={false}
            render={<Link href="/supplier/catalogue" />}
          >
            Back to products
          </Button>
        </div>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel>Price list</FieldLabel>
          {uploads.length ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Files">
              {uploads.map((upload) => (
                <li
                  key={upload.key}
                  className="rounded-card border border-outline bg-surface flex items-center gap-3 px-3 py-2"
                >
                  <span className="text-text-secondary">
                    {upload.state === "sending" ? (
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                    ) : (
                      <FileGlyph type={upload.type} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body text-text-primary truncate">
                      {upload.name}
                    </span>
                    <span
                      className={
                        upload.state === "failed"
                          ? "text-caption text-error"
                          : "text-caption text-text-muted"
                      }
                    >
                      {upload.state === "sending"
                        ? "Sending…"
                        : upload.state === "failed"
                          ? upload.error
                          : "Ready"}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${upload.name}`}
                    onClick={() =>
                      setUploads((current) => current.filter((u) => u.key !== upload.key))
                    }
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-text-muted m-0">
              A clear photo of the price list on your wall works.
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={SETUP_FILE_ACCEPT}
            className="sr-only"
            aria-label="Choose price-list files"
            data-testid="setup-files"
            onChange={(event) => pick(event.target.files)}
          />
          {room > 0 ? (
            <Button className="self-start" onClick={() => inputRef.current?.click()}>
              Choose photos, PDFs or voice notes
            </Button>
          ) : null}
          <FieldDescription>
            Up to {SETUP_FILES_MAX} files of 20 MB each. A voice note can be a recording
            saved on your phone or computer.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={messageId}>Message</FieldLabel>
          <Textarea
            id={messageId}
            value={message}
            maxLength={REQUEST_MESSAGE_MAX}
            placeholder="Tarpaulin ₱18 per sq ft. Same day if before 2 PM."
            onChange={(event) => setMessage(event.target.value)}
          />
          <FieldDescription>
            Optional. Anything the price list does not say.
          </FieldDescription>
        </Field>
      </FieldGroup>

      {tried && problem ? (
        <p
          className="text-body text-text-primary m-0"
          role="status"
          data-testid="flow-foot-note"
        >
          {problem}
        </p>
      ) : null}
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <div className="sm:w-64">
        <FlowAction
          label="Send to GRIDGO"
          hint="Ipadala sa GRIDGO"
          onClick={() => void send()}
          busy={sending}
          busyLabel="Sending…"
        />
      </div>

      <RequestList requests={requests} title="Sent to the GRIDGO team" />
    </div>
  );
}
