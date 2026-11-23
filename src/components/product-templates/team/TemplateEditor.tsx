"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { getTaxonomy, listAcceptedFileFormats, listProductTypeRequests } from "@/lib/api/client";
import {
  isTemplatesAbsent,
  listStaffProductTemplates,
  resolveRequestsWithTemplate,
  saveProductTemplate,
} from "@/lib/api/product-templates";
import type { Taxonomy } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { normalizeProductTypeRequests, type ProductTypeRequest } from "@/lib/listing-review";
import {
  TEMPLATE_UNITS,
  groupLabel,
  normalizeCatalogue,
  normalizeTemplate,
  unitName,
  type ProductTemplate,
  type TemplateUnit,
} from "@/lib/product-templates";

import { deskHref, readShops, shopNameOf, templateHref, type ShopRef, type Tree } from "./team-data";
import {
  combineOptionLists,
  draftFromTemplate,
  emptyTemplateDraft,
  governedPhotos,
  knownGroups,
  removedOptionKeys,
  requestsForTemplate,
  resolveRequestsBody,
  templateBody,
  templateErrorMessage,
  templateErrors,
  type TemplateDraft,
} from "./team-logic";

type Loaded = {
  templates: ProductTemplate[];
  taxonomy: Taxonomy | null;
  formats: { code: string; displayName: string }[];
  typeRequests: ProductTypeRequest[];
};

/**
 * One GRIDGO template, in full: the API replaces the whole definition on
 * save. Changes reach shops when they add it from now on; products already
 * added keep their own prices and facts. Below it, pending product-type
 * requests in its category, which this template can close.
 */
export function TemplateEditor({ tree, templateId }: { tree: Tree; templateId: string }) {
  const router = useRouter();
  const isNew = templateId === "new";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [absent, setAbsent] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [original, setOriginal] = useState<ProductTemplate | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [catalogue, taxonomy, formats, types] = await Promise.all([
        listStaffProductTemplates(),
        getTaxonomy().catch(() => null),
        listAcceptedFileFormats().catch(() => []),
        listProductTypeRequests("pending").catch(() => null),
      ]);
      const templates = normalizeCatalogue(catalogue).templates;
      setLoaded({
        templates,
        taxonomy,
        formats,
        typeRequests: types ? normalizeProductTypeRequests(types).requests : [],
      });
      if (isNew) {
        setOriginal(null);
        setDraft((current) => current ?? emptyTemplateDraft());
      } else {
        const found = templates.find((t) => t.id === templateId) ?? null;
        setOriginal(found);
        setDraft(found ? draftFromTemplate(found) : null);
      }
    } catch (err) {
      if (isTemplatesAbsent(err)) setAbsent(true);
      else setLoadError(opsErrorMessage(err, "Could not load the template. Try again."));
    }
  }, [isNew, templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (absent)
    return (
      <EmptyState
        title="Product templates are not on this server yet"
        body="This GRIDGO API has no product templates."
      />
    );
  if (loadError)
    return (
      <ErrorState
        title="The template could not load"
        body={loadError}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  if (!loaded || (!draft && isNew)) return <LoadingBlock label="Loading the template…" />;
  if (!draft)
    return (
      <EmptyState
        title="No template with this ID"
        body="It may have been renamed. Open the list to find it."
        action={
          <Button nativeButton={false} render={<Link href={deskHref(tree, "templates")} />}>
            All templates
          </Button>
        }
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <TemplateForm
        key={`${draft.id}:${draft.version ?? "new"}`}
        tree={tree}
        initial={draft}
        original={original}
        loaded={loaded}
        onSaved={(saved) => {
          if (isNew) router.replace(templateHref(tree, saved.id));
          else void load();
        }}
        onStale={() => void load()}
      />
      {original ? <WaitingRequests template={original} requests={loaded.typeRequests} onResolved={() => void load()} /> : null}
    </div>
  );
}

function TemplateForm({
  tree,
  initial,
  original,
  loaded,
  onSaved,
  onStale,
}: {
  tree: Tree;
  initial: TemplateDraft;
  original: ProductTemplate | null;
  loaded: Loaded;
  onSaved: (saved: ProductTemplate) => void;
  onStale: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const subcategories = useMemo(
    () => (loaded.taxonomy?.subcategories ?? []).filter((s) => s.active !== false),
    [loaded.taxonomy],
  );
  const categories = useMemo(
    () => (loaded.taxonomy?.categories ?? []).filter((c) => c.active !== false),
    [loaded.taxonomy],
  );
  const photos = useMemo(() => governedPhotos(loaded.templates), [loaded.templates]);
  const groups = useMemo(() => knownGroups(loaded.templates), [loaded.templates]);
  const errors = templateErrors(draft, {
    subcategories,
    formatCodes: new Set(loaded.formats.map((f) => f.code)),
    photoUrls: new Set(photos.map((p) => p.url)),
  });
  const errorCount = Object.keys(errors).length;
  const removed = removedOptionKeys(initial.options, draft.options);
  const show = (key: string) => (touched ? errors[key] : undefined);

  function set<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = (await saveProductTemplate(draft.id, templateBody(draft), draft.isNew ? null : draft.version)) as {
        template?: unknown;
      };
      const saved = normalizeTemplate({ ...(body.template as object), id: draft.id });
      setConfirming(false);
      setNotice(`Saved ${draft.name.trim()}. Shops see it when they add it from now on.`);
      if (saved) onSaved(saved);
    } catch (err) {
      setConfirming(false);
      setError(templateErrorMessage(err) ?? opsErrorMessage(err, "Could not save the template. Try again."));
      if (err && typeof err === "object" && "code" in err && err.code === "product_template_stale") onStale();
    } finally {
      setBusy(false);
    }
  }

  const subsInCategory = subcategories.filter((s) => s.categoryCode === draft.categoryCode);

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!errorCount) setConfirming(true);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h3 text-text-primary m-0">{draft.isNew ? "New template" : draft.name || "Template"}</h2>
          <p className="text-body text-text-secondary m-0 mt-1 max-w-2xl">
            Shops add it by pricing the options they make. Changes reach shops that add it from now on; products
            already added keep their own prices and facts.
          </p>
        </div>
        <Link href={deskHref(tree, "templates")} className="text-body text-text-secondary underline underline-offset-4">
          All templates
        </Link>
      </div>

      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={show("id") ? true : undefined}>
          <FieldLabel htmlFor={`${id}-id`}>Template ID</FieldLabel>
          <Input
            id={`${id}-id`}
            value={draft.id}
            disabled={!draft.isNew}
            aria-invalid={show("id") ? true : undefined}
            onChange={(e) => set("id", e.target.value.trim())}
          />
          <FieldDescription>
            {draft.isNew ? "Fixed once saved. For example tpl_a3_posters." : "Fixed: shops' products point at it."}
          </FieldDescription>
          {show("id") ? <FieldError>{show("id")}</FieldError> : null}
        </Field>
        <Field data-invalid={show("name") ? true : undefined}>
          <FieldLabel htmlFor={`${id}-name`}>Name clients see</FieldLabel>
          <Input
            id={`${id}-name`}
            value={draft.name}
            maxLength={120}
            aria-invalid={show("name") ? true : undefined}
            onChange={(e) => set("name", e.target.value)}
          />
          {show("name") ? <FieldError>{show("name")}</FieldError> : null}
        </Field>
        <Field data-invalid={show("group") ? true : undefined}>
          <FieldLabel htmlFor={`${id}-group`}>Group</FieldLabel>
          <Input
            id={`${id}-group`}
            list={`${id}-groups`}
            value={draft.group}
            maxLength={80}
            aria-invalid={show("group") ? true : undefined}
            onChange={(e) => set("group", e.target.value.trim())}
          />
          <datalist id={`${id}-groups`}>
            {groups.map((g) => (
              <option key={g} value={g}>
                {groupLabel(g)}
              </option>
            ))}
          </datalist>
          <FieldDescription>
            The chip shops filter by: {groups.map(groupLabel).join(", ") || "none yet"}.
          </FieldDescription>
          {show("group") ? <FieldError>{show("group")}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-unit`}>Priced per</FieldLabel>
          <Select value={draft.unit} onValueChange={(value) => set("unit", String(value) as TemplateUnit)}>
            <SelectTrigger id={`${id}-unit`} className="min-h-11 w-full">
              <SelectValue>{(value) => unitName(value as TemplateUnit)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TEMPLATE_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {unitName(u)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-cat`}>Category</FieldLabel>
          <Select
            value={draft.categoryCode}
            onValueChange={(value) =>
              setDraft((c) => ({ ...c, categoryCode: String(value ?? ""), subcategoryCode: "" }))
            }
          >
            <SelectTrigger id={`${id}-cat`} className="min-h-11 w-full">
              <SelectValue>
                {(value) => categories.find((c) => c.code === value)?.name ?? "Choose a category"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {categories.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>Only shops with this service line can add it.</FieldDescription>
        </Field>
        <Field data-invalid={show("subcategoryCode") ? true : undefined}>
          <FieldLabel htmlFor={`${id}-sub`}>Product type</FieldLabel>
          <Select value={draft.subcategoryCode} onValueChange={(value) => set("subcategoryCode", String(value ?? ""))}>
            <SelectTrigger id={`${id}-sub`} className="min-h-11 w-full" aria-invalid={show("subcategoryCode") ? true : undefined}>
              <SelectValue>
                {(value) => subsInCategory.find((s) => s.code === value)?.name ?? "Choose a product type"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {subsInCategory.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {show("subcategoryCode") ? <FieldError>{show("subcategoryCode")}</FieldError> : null}
        </Field>
        <Field orientation="horizontal">
          <Switch id={`${id}-active`} checked={draft.active} onCheckedChange={(v) => set("active", Boolean(v))} />
          <FieldLabel htmlFor={`${id}-active`}>
            {draft.active ? "Offered to shops" : "Retired: shops cannot add it"}
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch id={`${id}-express`} checked={draft.express} onCheckedChange={(v) => set("express", Boolean(v))} />
          <FieldLabel htmlFor={`${id}-express`}>{draft.express ? "Express product" : "Not Express"}</FieldLabel>
        </Field>
      </FieldGroup>

      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={show("description") ? true : undefined}>
          <FieldLabel htmlFor={`${id}-desc`}>Description clients read</FieldLabel>
          <Textarea
            id={`${id}-desc`}
            rows={4}
            maxLength={4000}
            value={draft.description}
            aria-invalid={show("description") ? true : undefined}
            onChange={(e) => set("description", e.target.value)}
          />
          {show("description") ? <FieldError>{show("description")}</FieldError> : null}
        </Field>
        <Field data-invalid={show("clientTips") ? true : undefined}>
          <FieldLabel htmlFor={`${id}-tips`}>Tips for the client</FieldLabel>
          <Textarea
            id={`${id}-tips`}
            rows={4}
            value={draft.clientTips}
            aria-invalid={show("clientTips") ? true : undefined}
            onChange={(e) => set("clientTips", e.target.value)}
          />
          <FieldDescription>One per line. A shop can write its own instead.</FieldDescription>
          {show("clientTips") ? <FieldError>{show("clientTips")}</FieldError> : null}
        </Field>
        <Field data-invalid={show("machinesNeeded") ? true : undefined}>
          <FieldLabel htmlFor={`${id}-machines`}>Machines needed</FieldLabel>
          <Input
            id={`${id}-machines`}
            value={draft.machinesNeeded}
            aria-invalid={show("machinesNeeded") ? true : undefined}
            onChange={(e) => set("machinesNeeded", e.target.value)}
          />
          <FieldDescription>
            Codes, comma separated, for example document_printer, large_format_printer. A hint for shops, not a rule.
          </FieldDescription>
          {show("machinesNeeded") ? <FieldError>{show("machinesNeeded")}</FieldError> : null}
        </Field>
        <Field data-invalid={show("priceRange") ? true : undefined}>
          <FieldLabel htmlFor={`${id}-min`}>Usual price (₱, low to high)</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-min`}
              inputMode="decimal"
              aria-label="Usual price, low end"
              value={draft.priceMin}
              onChange={(e) => set("priceMin", e.target.value)}
            />
            <span className="text-text-muted">to</span>
            <Input
              inputMode="decimal"
              aria-label="Usual price, high end"
              value={draft.priceMax}
              onChange={(e) => set("priceMax", e.target.value)}
            />
          </div>
          <FieldDescription>Prices outside it are flagged at the price check. Never a cap.</FieldDescription>
          {show("priceRange") ? <FieldError>{show("priceRange")}</FieldError> : null}
        </Field>
      </FieldGroup>

      <OptionsEditor draft={draft} setDraft={setDraft} error={show("options")} />

      <FieldSet data-invalid={show("fileTypes") ? true : undefined}>
        <FieldLegend>Artwork formats it accepts</FieldLegend>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          {loaded.formats.map((f) => {
            const checked = draft.fileTypes.includes(f.code);
            return (
              <label key={f.code} className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) =>
                    set(
                      "fileTypes",
                      v === true ? [...draft.fileTypes, f.code] : draft.fileTypes.filter((c) => c !== f.code),
                    )
                  }
                />
                <span className="text-body text-text-primary">{f.displayName}</span>
              </label>
            );
          })}
        </div>
        {show("fileTypes") ? <FieldError>{show("fileTypes")}</FieldError> : null}
      </FieldSet>

      <FieldSet data-invalid={show("stockPhotos") ? true : undefined}>
        <FieldLegend>Stock photos ({draft.stockPhotos.length} of up to 5)</FieldLegend>
        <FieldDescription>From GRIDGO&rsquo;s own set. The first is the cover. Shops may add real photos later.</FieldDescription>
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => {
            const index = draft.stockPhotos.findIndex((s) => s.url === p.url);
            const on = index >= 0;
            return (
              <li key={p.url}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${p.altText}${on ? `, photo ${index + 1}` : ""}`}
                  disabled={!on && draft.stockPhotos.length >= 5}
                  onClick={() =>
                    set(
                      "stockPhotos",
                      on
                        ? draft.stockPhotos.filter((s) => s.url !== p.url)
                        : [...draft.stockPhotos, { url: p.url, altText: draft.name || p.altText }],
                    )
                  }
                  className={`relative block w-full overflow-hidden rounded-[var(--radius-field)] border-2 ${on ? "border-foreground" : "border-transparent"} disabled:opacity-50`}
                >
                  {p.src ? (
                    // Public stock photo path; next/image would proxy it.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.src} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="bg-muted block aspect-square w-full" />
                  )}
                  {on ? (
                    <span className="bg-foreground text-background absolute top-1 left-1 rounded-full px-2 text-caption tabular-nums">
                      {index + 1}
                    </span>
                  ) : null}
                  <span className="text-caption text-text-secondary block truncate px-1 py-0.5 text-left">{p.altText}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {show("stockPhotos") ? <FieldError>{show("stockPhotos")}</FieldError> : null}
      </FieldSet>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-outline bg-background py-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving" : draft.isNew ? "Add template" : "Save template"}
        </Button>
        {touched && errorCount ? (
          <p className="text-body text-destructive m-0" role="alert">
            {errorCount === 1 ? "One field needs a fix." : `${errorCount} fields need a fix.`}
          </p>
        ) : null}
        {notice && !error ? (
          <p className="text-body text-text-primary m-0" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="text-body text-destructive m-0" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {draft.isNew ? `Add ${draft.name.trim()} for shops?` : `Save ${draft.name.trim()}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {draft.active
                ? `Shops that add it from now on see ${draft.options.length} option${draft.options.length === 1 ? "" : "s"}, priced per ${unitName(draft.unit).toLowerCase()}.`
                : "It is retired: shops cannot add it. Products already added keep working."}{" "}
              Products already added keep their own prices and facts.
              {original && original.active && !draft.active ? " Retiring hides it from the add list only." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removed.length ? (
            <p className="text-body text-text-primary m-0">
              Removed options ({removed.length}): {removed.slice(0, 6).join(", ")}
              {removed.length > 6 ? "…" : ""}. Shops that priced them keep their price on their own product.
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="primary" disabled={busy} onClick={() => void save()}>
              {draft.isNew ? "Add template" : "Save template"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

/**
 * The option lists shops read ("Size: A4, A3") and the full combinations
 * they price. Building from the lists keeps every existing option's key.
 */
function OptionsEditor({
  draft,
  setDraft,
  error,
}: {
  draft: TemplateDraft;
  setDraft: (update: (current: TemplateDraft) => TemplateDraft) => void;
  error: string | undefined;
}) {
  const id = useId();
  const [showAll, setShowAll] = useState(draft.options.length <= 30);
  const shown = showAll ? draft.options : draft.options.slice(0, 30);

  return (
    <FieldSet data-invalid={error ? true : undefined}>
      <FieldLegend>Options shops price ({draft.options.length} of up to 200)</FieldLegend>
      <FieldDescription>
        Each option is one full combination with its own full price. Write the lists, then build the combinations.
      </FieldDescription>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {draft.optionLists.map((list, index) => (
          <li key={index} className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
            <Input
              aria-label={`List ${index + 1} name`}
              placeholder="Paper size"
              value={list.name}
              onChange={(e) =>
                setDraft((c) => ({
                  ...c,
                  optionLists: c.optionLists.map((l, i) => (i === index ? { ...l, name: e.target.value } : l)),
                }))
              }
            />
            <Input
              aria-label={`List ${index + 1} values, comma separated`}
              placeholder="A4, A3"
              value={list.values}
              onChange={(e) =>
                setDraft((c) => ({
                  ...c,
                  optionLists: c.optionLists.map((l, i) => (i === index ? { ...l, values: e.target.value } : l)),
                }))
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove list ${list.name || index + 1}`}
              onClick={() => setDraft((c) => ({ ...c, optionLists: c.optionLists.filter((_, i) => i !== index) }))}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => setDraft((c) => ({ ...c, optionLists: [...c.optionLists, { name: "", values: "" }] }))}
        >
          <Plus data-icon="inline-start" aria-hidden />
          Add a list
        </Button>
        <Button
          type="button"
          disabled={!draft.optionLists.some((l) => l.values.trim())}
          onClick={() => setDraft((c) => ({ ...c, options: combineOptionLists(c.optionLists, c.options) }))}
        >
          <Wand2 data-icon="inline-start" aria-hidden />
          Build options from the lists
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-caption text-text-muted hidden grid-cols-[10rem_minmax(0,1fr)_auto] gap-2 sm:grid">
          <span id={`${id}-key`}>Key (fixed for shops)</span>
          <span id={`${id}-label`}>Option name</span>
          <span />
        </div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {shown.map((option, index) => (
            <li key={index} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
              <Input
                aria-label={`Option ${index + 1} key`}
                value={option.key}
                onChange={(e) =>
                  setDraft((c) => ({
                    ...c,
                    options: c.options.map((o, i) => (i === index ? { ...o, key: e.target.value.trim() } : o)),
                  }))
                }
              />
              <Input
                aria-label={`Option ${index + 1} name`}
                value={option.label}
                onChange={(e) =>
                  setDraft((c) => ({
                    ...c,
                    options: c.options.map((o, i) => (i === index ? { ...o, label: e.target.value } : o)),
                  }))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove option ${option.label || index + 1}`}
                onClick={() => setDraft((c) => ({ ...c, options: c.options.filter((_, i) => i !== index) }))}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {!showAll ? (
          <Button type="button" variant="ghost" className="self-start" onClick={() => setShowAll(true)}>
            Show all {draft.options.length} options
          </Button>
        ) : null}
        <Button
          type="button"
          className="self-start"
          onClick={() =>
            setDraft((c) => {
              const used = new Set(c.options.map((o) => o.key));
              let n = c.options.length;
              while (used.has(`variant_${n}`)) n += 1;
              return { ...c, options: [...c.options, { key: `variant_${n}`, label: "", specBinding: null }] };
            })
          }
        >
          <Plus data-icon="inline-start" aria-hidden />
          Add an option
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </FieldSet>
  );
}

/**
 * Pending product-type requests in the template's category (an A3 size a
 * shop asked for, say). Closing them points each at this template's product
 * type and tells each shop it can add it.
 */
function WaitingRequests({
  template,
  requests,
  onResolved,
}: {
  template: ProductTemplate;
  requests: ProductTypeRequest[];
  onResolved: () => void;
}) {
  const matching = requestsForTemplate(requests, template);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shops, setShops] = useState<ShopRef[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (matching.length) void readShops().then(setShops);
  }, [matching.length]);

  const chosen = matching.filter((r) => selected.has(r.id));

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      await resolveRequestsWithTemplate(template.id, resolveRequestsBody(chosen));
      setConfirming(false);
      setSelected(new Set());
      setMessage(`Closed ${chosen.length} request${chosen.length === 1 ? "" : "s"}. Each shop was told it can add ${template.name}.`);
      onResolved();
    } catch (err) {
      setConfirming(false);
      setError(
        err && typeof err === "object" && "code" in err && err.code === "product_type_request_not_pending"
          ? "Someone answered one of these already. The list is refreshed."
          : opsErrorMessage(err, "Could not close the requests. Try again."),
      );
      onResolved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="waiting-requests" className="gg-card flex flex-col gap-3 p-4">
      <h2 id="waiting-requests" className="text-h3 text-text-primary m-0">
        Waiting product-type requests this template can answer
      </h2>
      {message ? (
        <p role="status" className="text-body text-text-primary m-0">
          {message}
        </p>
      ) : null}
      {!template.active ? (
        <p className="text-body text-text-secondary m-0">Offer the template to shops before closing requests with it.</p>
      ) : !matching.length ? (
        <p className="text-body text-text-secondary m-0">No request in this category is waiting.</p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {matching.map((r) => (
              <li key={r.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
                  <Checkbox
                    className="mt-1"
                    checked={selected.has(r.id)}
                    onCheckedChange={(v) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (v === true) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body text-text-primary">{r.name}</span>
                    <span className="text-caption text-text-muted">
                      {shopNameOf(shops, r.supplierId)}
                      {r.createdAt ? ` · asked ${formatDateTime(r.createdAt)}` : ""}
                    </span>
                    {r.description ? (
                      <span className="text-caption text-text-secondary line-clamp-2">{r.description}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button className="self-start" disabled={!chosen.length || busy} onClick={() => setConfirming(true)}>
            Close {chosen.length || ""} with {template.name}
          </Button>
        </>
      )}
      {error ? (
        <p role="alert" className="text-body text-destructive m-0">
          {error}
        </p>
      ) : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {chosen.length === 1 ? "this request" : `${chosen.length} requests`} with {template.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Each shop is told it can now add {template.name} from Products.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {chosen.map((r) => (
              <li key={r.id} className="text-body text-text-primary">
                {r.name} <span className="text-text-muted">({shopNameOf(shops, r.supplierId)})</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void resolve()}>
              Close and tell the shops
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
