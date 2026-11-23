"use client";

import { useId, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { prepareShopTemplateProduct, reviseShopTemplateProduct } from "@/lib/api/product-templates";
import { formatPhp } from "@/lib/format";
import type { Listing } from "@/lib/listings";
import {
  draftRows,
  fromPriceLine,
  priceBlocker,
  pricesBody,
  serviceFor,
  type PriceRow,
  type ProductTemplate,
  type ReadyTimeChip,
  type TemplateFacts,
} from "@/lib/product-templates";

import { TeamPriceTable } from "./TeamPriceTable";
import { keepShopExtras, prepareErrorMessage, readyTimeName } from "./team-logic";

export type ServiceRef = { id: string; categoryCode: string; state?: string };

/** What the sheet opens on: a fresh product, or one already prepared. */
export type PrepareTarget =
  | { kind: "new" }
  | { kind: "revise"; listing: Listing; facts: TemplateFacts; prices: PriceRow[] };

const TARPAULIN = "tarpaulins_outdoor_banners";

/**
 * Prepare (or revise) one template product for a shop from its price list.
 * The product stays hidden until the shop confirms the prices; a revision
 * asks the shop to confirm again. Nothing here makes a product live.
 */
export function PrepareSheet({
  open,
  onOpenChange,
  target,
  supplierId,
  shopName,
  templates,
  addedTemplateIds,
  services,
  resolveCategory,
  readyTimes,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PrepareTarget;
  supplierId: string;
  shopName: string;
  templates: ProductTemplate[];
  addedTemplateIds: ReadonlySet<string>;
  services: ServiceRef[];
  resolveCategory: (code: string) => string;
  readyTimes: ReadyTimeChip[];
  onDone: (message: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {open ? (
          <PrepareForm
            key={target.kind === "revise" ? `${target.listing.id}:${target.listing.version}` : "new"}
            target={target}
            supplierId={supplierId}
            shopName={shopName}
            templates={templates}
            addedTemplateIds={addedTemplateIds}
            services={services}
            resolveCategory={resolveCategory}
            readyTimes={readyTimes}
            onDone={(message) => {
              onOpenChange(false);
              onDone(message);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PrepareForm({
  target,
  supplierId,
  shopName,
  templates,
  addedTemplateIds,
  services,
  resolveCategory,
  readyTimes,
  onDone,
}: Omit<Parameters<typeof PrepareSheet>[0], "open" | "onOpenChange">) {
  const id = useId();
  const revising = target.kind === "revise" ? target : null;
  const choices = useMemo(
    () =>
      revising
        ? templates.filter((t) => t.id === revising.facts.templateId)
        : templates.filter((t) => t.active && !addedTemplateIds.has(t.id)),
    [templates, addedTemplateIds, revising],
  );
  const [templateId, setTemplateId] = useState<string | null>(
    revising?.facts.templateId ?? null,
  );
  const template = choices.find((t) => t.id === templateId) ?? null;
  const [rows, setRows] = useState(() => (template ? draftRows(template, revising?.prices ?? []) : []));
  const [readyTime, setReadyTime] = useState<string | null>(revising?.facts.readyTime ?? null);
  const [width, setWidth] = useState(
    revising?.listing.printerMaxWidthFeet != null ? String(revising.listing.printerMaxWidthFeet) : "",
  );
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = template ? serviceFor(template, services, resolveCategory) : null;
  const tarp = template?.subcategoryCode === TARPAULIN;
  const widthValue = Number(width);
  const widthOk = !tarp || (Number.isInteger(widthValue) && widthValue >= 1 && widthValue <= 20);
  const blocker = !template
    ? "Choose a template."
    : !service
      ? `${shopName} has no service line for this category. It must add the service first.`
      : (priceBlocker(rows) ??
        (!readyTime ? "Choose a ready time." : !widthOk ? "Enter the printer width in feet, 1 to 20." : null));
  const priced = pricesBody(rows);

  function pick(next: string | null) {
    setTemplateId(next);
    const t = choices.find((c) => c.id === next);
    setRows(t ? draftRows(t) : []);
    setShowErrors(false);
  }

  async function submit() {
    if (!template || !service || !readyTime) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      templateId: template.id,
      supplierServiceId: service.id,
      readyTime,
      prices: priced,
      ...(revising ? keepShopExtras(revising.listing, revising.facts.clientTips.length ? revising.facts.clientTips : null) : {}),
      ...(tarp ? { printerMaxWidthFeet: widthValue } : {}),
    };
    // GRIDGO's own tips are the default; carrying them back as "shop tips" would pin them.
    if (revising && template.clientTips.join("\n") === revising.facts.clientTips.join("\n")) delete body.clientTips;
    try {
      if (revising && revising.listing.version != null)
        await reviseShopTemplateProduct(supplierId, revising.listing.id, revising.listing.version, body);
      else await prepareShopTemplateProduct(supplierId, body);
      onDone(
        revising
          ? `Revised ${template.name}. ${shopName} is asked to confirm the new prices.`
          : `Prepared ${template.name}. It stays hidden until ${shopName} confirms the prices.`,
      );
    } catch (err) {
      setConfirming(false);
      setError(prepareErrorMessage(err) ?? opsErrorMessage(err, "Could not save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <SheetHeader className="p-0">
        <SheetTitle>{revising ? `Revise ${revising.listing.name}` : `Prepare a product for ${shopName}`}</SheetTitle>
        <SheetDescription>
          From the shop&rsquo;s price list. It stays hidden until {shopName} confirms the prices.
        </SheetDescription>
      </SheetHeader>

      {revising ? null : (
        <Field>
          <FieldLabel htmlFor={`${id}-tpl`}>Template</FieldLabel>
          <Select value={templateId ?? ""} onValueChange={(v) => pick(typeof v === "string" && v ? v : null)}>
            <SelectTrigger id={`${id}-tpl`} className="min-h-11 w-full">
              <SelectValue>{(v) => choices.find((t) => t.id === v)?.name ?? "Choose a template"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {choices.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {serviceFor(t, services, resolveCategory) ? "" : " (needs a service line)"}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>Templates this shop already has are left out; revise those instead.</FieldDescription>
        </Field>
      )}

      {template ? (
        <>
          <section className="flex flex-col gap-2" aria-labelledby={`${id}-prices`}>
            <h3 id={`${id}-prices`} className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              Full prices
            </h3>
            <TeamPriceTable template={template} rows={rows} onChange={setRows} showErrors={showErrors} />
          </section>

          <Field>
            <FieldLabel id={`${id}-ready`}>Ready time</FieldLabel>
            <ToggleGroup
              aria-labelledby={`${id}-ready`}
              value={readyTime ? [readyTime] : []}
              onValueChange={(values) => setReadyTime((values[0] as string | undefined) ?? null)}
              variant="outline"
              spacing={0}
              className="flex-wrap"
            >
              {readyTimes.map((c) => (
                <ToggleGroupItem key={c.code} value={c.code}>
                  {c.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          {tarp ? (
            <Field>
              <FieldLabel htmlFor={`${id}-width`}>Widest the shop&rsquo;s printer prints (feet)</FieldLabel>
              <Input
                id={`${id}-width`}
                inputMode="numeric"
                className="w-28"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </Field>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-outline pt-4">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setShowErrors(true);
            if (!blocker) setConfirming(true);
          }}
        >
          {revising ? "Save and ask the shop to confirm" : "Prepare for the shop"}
        </Button>
        {showErrors && blocker ? <p className="text-caption text-destructive m-0">{blocker}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="text-body text-destructive m-0">
          {error}
        </p>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revising ? `Send new prices to ${shopName}?` : `Prepare ${template?.name} for ${shopName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {priced.length} option{priced.length === 1 ? "" : "s"}, {fromPriceLine(rows, template?.unit ?? null) ?? ""}, ready{" "}
              {readyTimeName(readyTimes, readyTime).toLowerCase()}. It stays hidden until {shopName} confirms the
              prices; then the GRIDGO team checks them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="m-0 flex max-h-48 list-none flex-col gap-0.5 overflow-y-auto p-0">
            {priced.map((row) => (
              <li key={row.optionKey} className="text-body text-text-primary flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {template?.options.find((o) => o.key === row.optionKey)?.label ?? row.optionKey}
                </span>
                <span className="tabular-nums">{formatPhp(row.priceMinor)}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void submit()}>
              {busy ? "Saving" : revising ? "Send to the shop" : "Prepare"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
