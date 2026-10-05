"use client";

import { useId, useState, type RefObject } from "react";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDateTime } from "@/lib/format";
import {
  PRODUCT_TYPE_CODE_MAX,
  productTypeCodeError,
  requestChip,
  suggestProductTypeCode,
  type ProductTypeRequest,
} from "@/lib/listing-review";

type Props = {
  request: ProductTypeRequest;
  shopName: string;
  categoryName: string;
  existingCodes: ReadonlySet<string>;
  /** Product types already in this category, so a duplicate is easy to spot. */
  siblings: readonly string[];
  busy: boolean;
  actionError: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onApprove: (code: string) => void;
  onSendBack: () => void;
};

/**
 * A shop asking for a product type GRIDGO does not list yet. Approving adds
 * it to the chart for every shop; it never gives the asking shop a service
 * line or approves a listing.
 */
export function ProductTypePanel({
  request,
  shopName,
  categoryName,
  existingCodes,
  siblings,
  busy,
  actionError,
  headingRef,
  onBack,
  onApprove,
  onSendBack,
}: Props) {
  const [code, setCode] = useState(() => suggestProductTypeCode(request.name));
  const [touched, setTouched] = useState(false);
  const codeId = useId();
  const chip = requestChip(request);
  const codeError = productTypeCodeError(code, existingCodes);
  const pending = request.status === "pending";

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-outline px-4 pt-3 pb-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start lg:hidden"
          onClick={onBack}
        >
          <ChevronLeft aria-hidden="true" />
          All requests
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-h3 text-text-primary m-0 break-words outline-offset-4"
            >
              {request.name}
            </h2>
            <p className="text-body text-text-secondary m-0 mt-1">
              Asked for by {shopName}, under {categoryName}
            </p>
            {request.createdAt ? (
              <p className="text-caption text-text-muted m-0 mt-1">
                Sent {formatDateTime(request.createdAt)}
              </p>
            ) : null}
          </div>
          <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
        </div>
      </div>

      <div
        key={request.id}
        role="region"
        aria-label={`${request.name} request`}
        tabIndex={0}
        className="flex flex-col gap-5 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
      >
        <section className="flex flex-col gap-1">
          <h3
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            What the shop wrote
          </h3>
          <p className="text-body text-text-secondary m-0 max-w-[72ch] whitespace-pre-line break-words">
            {request.description || "No description."}
          </p>
        </section>
        {pending ? (
          <section className="flex flex-col gap-1">
            <h3
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Already in {categoryName}
            </h3>
            <p className="text-body text-text-secondary m-0 max-w-[72ch]">
              {siblings.length ? siblings.join(", ") : "No product types yet."}
            </p>
            <p className="text-caption text-text-muted m-0">
              If one of these already covers it, send the request back and name it.
            </p>
          </section>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-outline bg-surface p-4">
        {pending ? (
          <>
            <Field
              data-invalid={touched && codeError ? true : undefined}
              className="max-w-md"
            >
              <FieldLabel htmlFor={codeId}>Code for the new product type</FieldLabel>
              <Input
                id={codeId}
                value={code}
                maxLength={PRODUCT_TYPE_CODE_MAX}
                spellCheck={false}
                autoCapitalize="none"
                aria-invalid={touched && codeError ? true : undefined}
                onChange={(event) => {
                  setCode(event.target.value);
                  setTouched(true);
                }}
              />
              {touched && codeError ? (
                <FieldError>{codeError}</FieldError>
              ) : (
                <FieldDescription>
                  Stored by GRIDGO, never shown to clients. Lowercase letters, numbers and
                  underscores.
                </FieldDescription>
              )}
            </Field>
            <p className="text-caption text-text-secondary m-0 max-w-prose">
              Adding it puts “{request.name}” under {categoryName} for every shop to pick.
              It does not give this shop a service line or approve any listing.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setTouched(true);
                  if (!codeError) onApprove(code.trim());
                }}
              >
                {busy ? "Saving" : "Add product type"}
              </Button>
              <Button disabled={busy} onClick={onSendBack}>
                Send back
              </Button>
            </div>
          </>
        ) : request.status === "needs_revision" ? (
          <div className="flex flex-col gap-1">
            <p className="text-caption text-text-muted m-0">
              Sent back
              {request.reviewedAt ? ` ${formatDateTime(request.reviewedAt)}` : ""}. The
              shop reads:
            </p>
            <p className="text-body text-text-primary m-0 max-w-[72ch] whitespace-pre-line">
              {request.reason ?? "No reason on file."}
            </p>
          </div>
        ) : (
          <p className="text-body text-text-secondary m-0">
            Added{request.reviewedAt ? ` ${formatDateTime(request.reviewedAt)}` : ""}
            {request.productTypeCode ? ` as ${request.productTypeCode}` : ""}. Shops can
            now pick it.
          </p>
        )}
        {actionError ? (
          <p role="alert" className="text-body text-destructive m-0">
            {actionError}
          </p>
        ) : null}
      </div>
    </>
  );
}
