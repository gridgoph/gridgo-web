"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { listingErrorMessage } from "@/app/supplier/_lib/listings-api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { loadShopServiceLines } from "@/app/supplier/_lib/listings-api";
import {
  createCatalogItem,
  getTaxonomy,
  listListingStarters,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { LISTING_CAPS, boardTargets, normalizeServiceLines, normalizeStarters, type ListingStarter, type ServiceLine } from "@/lib/listings";

const BLANK = "__blank__";

export default function NewListingPage() {
  const router = useRouter();
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
  const [subcategoryCode, setSubcategoryCode] = useState<string | null>(null);
  const [starterId, setStarterId] = useState<string>(BLANK);
  const [starters, setStarters] = useState<ListingStarter[]>([]);
  const [startersLoading, setStartersLoading] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const [tax, servicesBody] = await Promise.all([
          getTaxonomy(),
          loadShopServiceLines(),
        ]);
        if (gone) return;
        setTaxonomy(tax);
        setServices(normalizeServiceLines(servicesBody));
        setError(null);
      } catch (err) {
        if (!gone) setError(listingErrorMessage(err, "Could not load what you are accredited for."));
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, []);

  const targets = useMemo(() => boardTargets(taxonomy, services), [taxonomy, services]);

  useEffect(() => {
    if (!categoryCode && targets.length === 1) setCategoryCode(targets[0].categoryCode);
  }, [categoryCode, targets]);

  const target = targets.find((entry) => entry.categoryCode === categoryCode) ?? null;

  useEffect(() => {
    setStarters([]);
    setStarterId(BLANK);
    if (!subcategoryCode) return;
    let gone = false;
    setStartersLoading(true);
    void (async () => {
      try {
        const body = await listListingStarters(subcategoryCode);
        if (gone) return;
        const next = normalizeStarters(body);
        setStarters(next);
        setStarterId(next[0]?.id ?? BLANK);
      } catch {
        if (!gone) {
          setStarters([]);
          setStarterId(BLANK);
        }
      } finally {
        if (!gone) setStartersLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, [subcategoryCode]);

  async function create() {
    if (!target || !subcategoryCode || !name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        supplierServiceId: target.service.id,
        subcategoryCode,
        name: name.trim(),
        active: false,
      };
      if (starterId !== BLANK) body.starterId = starterId;
      const created = await createCatalogItem(body);
      const id =
        created && typeof created === "object" && "item" in created
          ? (created as { item?: { id?: string } }).item?.id
          : (created as { id?: string })?.id;
      if (!id) throw new Error("unreadable");
      router.replace(`/supplier/catalogue/${id}`);
    } catch (err) {
      setSaveError(listingErrorMessage(err, "Could not open this listing."));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Could not start a listing" body={error} />;
  }

  if (!targets.length) {
    return (
      <EmptyState
        title="No accredited category to file this under"
        body="A listing sits under a category Operations has accredited. Finish that on Capacity first, then come back."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-overline text-text-muted m-0 uppercase">New listing</p>
          <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
            File it under a category you are accredited for, name it the way a client would ask,
            then pick a GRIDGO starter if you do not want to invent the steps.
          </p>
        </div>

        <FieldGroup>
          {targets.length > 1 ? (
            <Field>
              <FieldLabel>Category</FieldLabel>
              <Select
                value={categoryCode ?? ""}
                onValueChange={(value) => {
                  setCategoryCode(typeof value === "string" ? value : null);
                  setSubcategoryCode(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {target?.categoryName ?? "Choose a category"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {targets.map((entry) => (
                      <SelectItem key={entry.categoryCode} value={entry.categoryCode}>
                        {entry.categoryName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field>
              <FieldLabel>Category</FieldLabel>
              <p className="text-body text-text-primary m-0">{targets[0].categoryName}</p>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="kind">Kind of work</FieldLabel>
            <Select
              value={subcategoryCode ?? ""}
              onValueChange={(value) => setSubcategoryCode(typeof value === "string" ? value : null)}
              disabled={!target}
            >
              <SelectTrigger id="kind">
                <SelectValue>
                  {target?.covers.find((cover) => cover.code === subcategoryCode)?.name ??
                    "Choose the work"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(target?.covers ?? []).map((cover) => (
                    <SelectItem key={cover.code} value={cover.code}>
                      {cover.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Filed under this category. You can move it within that category, not out of it.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="listing-name">What clients will call it</FieldLabel>
            <Input
              id="listing-name"
              value={name}
              maxLength={LISTING_CAPS.nameChars}
              onChange={(event) => setName(event.target.value)}
              placeholder="Flyers"
            />
          </Field>
        </FieldGroup>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="text-overline text-text-muted m-0 uppercase">Start from</p>
          <p className="text-caption text-text-secondary m-0 mt-1">
            A starter is a copy, not a link. Its steps and add-ons become yours the moment
            the listing exists.
          </p>
        </div>
        {startersLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStarterId(BLANK)}
              className={`rounded-card border min-h-28 p-4 text-left ${
                starterId === BLANK
                  ? "border-foreground bg-surface"
                  : "border-outline bg-surface hover:bg-overlay-hover"
              }`}
            >
              <p className="text-body m-0" style={{ fontFamily: "var(--font-medium)" }}>
                Blank listing
              </p>
              <p className="text-caption text-text-secondary m-0 mt-1">
                You write the steps and prices yourself.
              </p>
            </button>
            {starters.map((starter) => (
              <button
                type="button"
                key={starter.id}
                onClick={() => setStarterId(starter.id)}
                className={`rounded-card border min-h-28 p-4 text-left ${
                  starterId === starter.id
                    ? "border-foreground bg-surface"
                    : "border-outline bg-surface hover:bg-overlay-hover"
                }`}
              >
                <p className="text-body m-0" style={{ fontFamily: "var(--font-medium)" }}>
                  {starter.name}
                </p>
                <p className="text-caption text-text-secondary m-0 mt-1">
                  {starter.specCount || starter.addOnCount
                    ? `${starter.specCount} steps, ${starter.addOnCount} add-ons`
                    : "GRIDGO starter"}
                </p>
              </button>
            ))}
          </div>
        )}

        {saveError ? <p className="text-body text-destructive m-0">{saveError}</p> : null}

        <Button
          variant="primary"
          disabled={!subcategoryCode || !name.trim() || saving}
          onClick={() => void create()}
        >
          {saving ? "Opening…" : "Open this listing"}
        </Button>
      </div>
    </div>
  );
}
