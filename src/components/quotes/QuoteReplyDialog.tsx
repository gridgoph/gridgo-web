"use client";

/**
 * Record or change one shop's reply to a quote request: the shop, its price
 * for the whole job, its production time and what it recommends. The shop's
 * price is its own; the client sees it with GRIDGO's fee added, which the API
 * works out.
 */

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listUsers } from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import {
  emptyReplyDraft,
  QUOTE_TEXT_MAX,
  readReplyDraft,
  replyDraftFrom,
  type QuoteReply,
  type ReplyBody,
  type ReplyDraft,
  type ReplyField,
} from "@/lib/quote-requests";

export type ShopChoice = { id: string; name: string };

/** Approved shop accounts that are not on hold, by name. */
export function shopChoices(users: readonly User[]): ShopChoice[] {
  return users
    .filter(
      (user) =>
        user.verificationStatus === "approved" &&
        (user.accountStatus ?? "active") === "active",
    )
    .map((user) => ({ id: user.id, name: user.supplierName?.trim() || user.name?.trim() || "Shop" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function QuoteReplyDialog({
  open,
  reply,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  /** The reply being changed; a new reply when absent. */
  reply: QuoteReply | null;
  onCancel: () => void;
  /** Throws an already-worded message on failure. */
  onSubmit: (body: ReplyBody) => Promise<void>;
}) {
  const editing = Boolean(reply);
  const [draft, setDraft] = useState<ReplyDraft>(emptyReplyDraft);
  const [errors, setErrors] = useState<Partial<Record<ReplyField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [shops, setShops] = useState<ShopChoice[] | null>(null);
  const [shopsFailed, setShopsFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(reply ? replyDraftFrom(reply) : emptyReplyDraft());
    setErrors({});
    setFailure(null);
  }, [open, reply]);

  useEffect(() => {
    if (!open || editing || shops) return;
    let cancelled = false;
    setShopsFailed(false);
    (async () => {
      try {
        const users = await listUsers("supplier");
        if (!cancelled) setShops(shopChoices(users));
      } catch {
        if (!cancelled) setShopsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editing, shops]);

  const shopName = useMemo(
    () => shops?.find((shop) => shop.id === draft.supplierId)?.name ?? null,
    [shops, draft.supplierId],
  );

  function set<K extends keyof ReplyDraft>(key: K, value: ReplyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFailure(null);
  }

  async function submit() {
    const read = readReplyDraft(draft, { editing });
    if (!read.ok) {
      setErrors(read.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(read.body);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Could not save this reply. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Change ${reply?.shopName ?? "the shop"}'s reply` : "Add a shop reply"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "A published option keeps the price the client was shown until you publish again."
              : "What the shop told you. The client never sees the shop's name or its own price."}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {editing ? null : (
            <Field data-invalid={errors.supplierId ? true : undefined}>
              <FieldLabel htmlFor="quote-reply-shop">Shop</FieldLabel>
              <Select
                value={draft.supplierId || null}
                onValueChange={(value) => {
                  if (typeof value === "string") set("supplierId", value);
                }}
                disabled={busy || !shops}
              >
                <SelectTrigger
                  id="quote-reply-shop"
                  className="min-h-11 w-full"
                  aria-invalid={errors.supplierId ? true : undefined}
                >
                  <SelectValue>
                    {shopName ?? (shops ? "Choose a shop" : shopsFailed ? "Shops did not load" : "Loading shops…")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(shops ?? []).map((shop) => (
                      <SelectItem key={shop.id} value={shop.id}>
                        {shop.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {errors.supplierId ? (
                <FieldError>{errors.supplierId}</FieldError>
              ) : shopsFailed ? (
                <FieldError>
                  The shop list did not load.{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => setShops(null)}
                  >
                    Try again
                  </button>
                </FieldError>
              ) : (
                <FieldDescription>
                  Approved shops. GRIDGO checks the shop can still take work when you save.
                </FieldDescription>
              )}
            </Field>
          )}

          <Field data-invalid={errors.price ? true : undefined}>
            <FieldLabel htmlFor="quote-reply-price">Shop&rsquo;s price for the whole job</FieldLabel>
            <div className="relative max-w-48">
              <span
                aria-hidden
                className="text-body text-text-muted pointer-events-none absolute inset-y-0 left-3 flex items-center"
              >
                ₱
              </span>
              <Input
                id="quote-reply-price"
                inputMode="decimal"
                className="pl-7"
                value={draft.price}
                disabled={busy}
                aria-invalid={errors.price ? true : undefined}
                onChange={(event) => set("price", event.target.value)}
              />
            </div>
            {errors.price ? (
              <FieldError>{errors.price}</FieldError>
            ) : (
              <FieldDescription>
                What the shop is paid. The client sees it with GRIDGO&rsquo;s fee added.
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={errors.productionTime ? true : undefined}>
            <FieldTitle id="quote-reply-time-label">Production time</FieldTitle>
            <RadioGroup
              aria-labelledby="quote-reply-time-label"
              value={draft.mode}
              onValueChange={(value) => set("mode", value as ReplyDraft["mode"])}
              disabled={busy}
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  ["days", "Working days"],
                  ["same_day", "Same day"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-field border border-outline bg-surface px-3 has-[[data-checked]]:border-accent"
                >
                  <RadioGroupItem value={value} />
                  <span className="text-body text-text-primary">{label}</span>
                </label>
              ))}
            </RadioGroup>
            {draft.mode === "days" ? (
              <div className="flex flex-wrap items-end gap-3">
                <Field className="w-28">
                  <FieldLabel htmlFor="quote-reply-min-days">Soonest</FieldLabel>
                  <Input
                    id="quote-reply-min-days"
                    inputMode="numeric"
                    value={draft.minDays}
                    disabled={busy}
                    onChange={(event) => set("minDays", event.target.value)}
                  />
                </Field>
                <Field className="w-28">
                  <FieldLabel htmlFor="quote-reply-max-days">Latest</FieldLabel>
                  <Input
                    id="quote-reply-max-days"
                    inputMode="numeric"
                    value={draft.maxDays}
                    disabled={busy}
                    onChange={(event) => set("maxDays", event.target.value)}
                  />
                </Field>
                <span className="text-body text-text-secondary pb-3">working days</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <Field className="w-28">
                  <FieldLabel htmlFor="quote-reply-hours">Hours</FieldLabel>
                  <Input
                    id="quote-reply-hours"
                    inputMode="decimal"
                    value={draft.hours}
                    disabled={busy}
                    onChange={(event) => set("hours", event.target.value)}
                  />
                </Field>
                <span className="text-body text-text-secondary pb-3">ready the same day</span>
              </div>
            )}
            {errors.productionTime ? (
              <FieldError>{errors.productionTime}</FieldError>
            ) : (
              <FieldDescription>
                GRIDGO works out the ready date from the shop&rsquo;s hours.
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={errors.recommendedOptions ? true : undefined}>
            <FieldLabel htmlFor="quote-reply-recommended">
              What the shop recommends (optional)
            </FieldLabel>
            <Textarea
              id="quote-reply-recommended"
              rows={3}
              maxLength={QUOTE_TEXT_MAX}
              value={draft.recommendedOptions}
              disabled={busy}
              onChange={(event) => set("recommendedOptions", event.target.value)}
              placeholder="For example: tarpaulin with grommets, matte finish."
            />
            {errors.recommendedOptions ? (
              <FieldError>{errors.recommendedOptions}</FieldError>
            ) : (
              <FieldDescription>The client reads this with the option.</FieldDescription>
            )}
          </Field>

          <Field data-invalid={errors.note ? true : undefined}>
            <FieldLabel htmlFor="quote-reply-note">Note for Operations (optional)</FieldLabel>
            <Textarea
              id="quote-reply-note"
              rows={2}
              maxLength={QUOTE_TEXT_MAX}
              value={draft.note}
              disabled={busy}
              onChange={(event) => set("note", event.target.value)}
              placeholder="For example: called the shop at 10 AM."
            />
            {errors.note ? (
              <FieldError>{errors.note}</FieldError>
            ) : (
              <FieldDescription>Only Operations and Super Admin see it.</FieldDescription>
            )}
          </Field>
        </FieldGroup>
        {failure ? (
          <p className="text-body text-error m-0" role="alert">
            {failure}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : editing ? "Save reply" : "Add reply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
