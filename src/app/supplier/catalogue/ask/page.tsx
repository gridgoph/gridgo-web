"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { FlowAction } from "@/components/product-templates/supplier/FlowParts";
import { RequestList } from "@/components/product-templates/supplier/RequestList";
import { templateErrorMessage } from "@/components/product-templates/supplier/errors";
import { useSetupRequests } from "@/components/product-templates/supplier/useSetupRequests";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProductSetupRequest } from "@/lib/api/product-templates";
import { REQUEST_MESSAGE_MAX, REQUEST_NAME_MAX } from "@/lib/product-templates";

/**
 * "Not in the list?": ask GRIDGO to add a product as a template. About one
 * working day, and the shop is told when it is there. The full builder stays
 * one click away for a shop that cannot wait.
 */
export default function AskTemplatePage() {
  const nameId = useId();
  const messageId = useId();
  const { requests, reload } = useSetupRequests("template");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const nameProblem = !name.trim() ? "Name the product, the way a client would ask for it." : null;
  const messageProblem = !message.trim() ? "Say a little about it: sizes, paper or material." : null;

  async function send() {
    if (nameProblem || messageProblem) {
      setTried(true);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await createProductSetupRequest({
        kind: "template",
        requestedName: name.trim(),
        message: message.trim(),
      });
      setSent(name.trim());
      setName("");
      setMessage("");
      setTried(false);
      void reload();
    } catch (err) {
      setError(templateErrorMessage(err, "Your request was not sent."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 text-text-primary m-0">Ask GRIDGO to add a product</h1>
        <p className="text-body text-text-secondary m-0">
          The GRIDGO team adds it to the list, usually within one working day, and tells you. Then
          you tick it and price it like any other.
        </p>
      </div>

      {sent ? (
        <div
          className="rounded-card border border-outline bg-surface-variant flex flex-col gap-1 p-3"
          role="status"
          data-testid="request-sent"
        >
          <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
            Sent: &ldquo;{sent}&rdquo;
          </p>
          <p className="text-body text-text-secondary m-0">We tell you when it is in the list.</p>
        </div>
      ) : null}

      <FieldGroup>
        <Field data-invalid={tried && nameProblem ? true : undefined}>
          <FieldLabel htmlFor={nameId}>Product</FieldLabel>
          <Input
            id={nameId}
            value={name}
            maxLength={REQUEST_NAME_MAX}
            placeholder="Acrylic keychains"
            aria-invalid={tried && nameProblem ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldDescription>The name a client would look for.</FieldDescription>
          {tried && nameProblem ? <FieldError>{nameProblem}</FieldError> : null}
        </Field>
        <Field data-invalid={tried && !nameProblem && messageProblem ? true : undefined}>
          <FieldLabel htmlFor={messageId}>About it</FieldLabel>
          <Textarea
            id={messageId}
            value={message}
            maxLength={REQUEST_MESSAGE_MAX}
            placeholder="5 cm, 3 mm acrylic, printed both sides. Priced per piece."
            aria-invalid={tried && messageProblem ? true : undefined}
            onChange={(event) => setMessage(event.target.value)}
          />
          <FieldDescription>Sizes, paper or material, and how you price it.</FieldDescription>
          {tried && !nameProblem && messageProblem ? <FieldError>{messageProblem}</FieldError> : null}
        </Field>
      </FieldGroup>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-64">
          <FlowAction
            label="Send request"
            hint="Ipadala"
            onClick={() => void send()}
            busy={sending}
            busyLabel="Sending…"
          />
        </div>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href="/supplier/catalogue/new" />}
        >
          Make a custom product instead
        </Button>
      </div>

      <RequestList requests={requests} title="Your requests" />
    </div>
  );
}
