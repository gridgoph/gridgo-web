"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

import { FeaturedPrintsPicker } from "@/components/featured-prints/FeaturedPrintsPicker";
import { FeaturedPrintsPreview } from "@/components/featured-prints/FeaturedPrintsPreview";
import { SampleFrame } from "@/components/featured-prints/SampleFrame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  getFeaturedPrints,
  getStaffCatalogItem,
  isApiError,
  saveFeaturedPrints,
} from "@/lib/api/client";
import {
  FEATURED_PRINTS_MAX,
  FEATURED_PRINTS_REASON_MAX,
  clientPriceLine,
  clientUnitLine,
  featuredPrintsErrorMessage,
  idsOf,
  moveEntry,
  normalizeFeaturedPrints,
  sameOrder,
  saveBlocker,
  unavailableIdsFrom,
  type FeaturedCard,
  type FeaturedEntry,
  type FeaturedPrints,
} from "@/lib/featured-prints";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { normalizeStaffCatalogDetail } from "@/lib/supplier-products";

/**
 * Featured Prints: which approved products the client's Home row shows, and
 * in what order (gridgo-client#239, gridgo-api docs/FEATURED_PRINTS_API.md).
 * One implementation for Operations and Super Admin; both may save.
 *
 * Edits stay on this screen until Save, which replaces the whole list with a
 * reason, against the version that was read. Another person's save is never
 * overwritten silently: the screen shows their list and asks which to keep.
 */
export function FeaturedPrintsDesk() {
  const [saved, setSaved] = useState<FeaturedPrints | null>(null);
  const [entries, setEntries] = useState<FeaturedEntry[]>([]);
  const [reason, setReason] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
  // Someone else's save, waiting for this person to choose a list.
  const [newer, setNewer] = useState<FeaturedPrints | null>(null);
  // Names of products the API no longer sends a card for, read from the staff
  // listing so staff know what they are removing. Only the name is kept.
  const [missingNames, setMissingNames] = useState<Record<string, string | null>>({});

  const dirty = saved != null && !sameOrder(idsOf(entries), idsOf(saved.entries));
  const state = useRef({ saved, dirty });
  state.current = { saved, dirty };

  /** Fresh cards (and signed photo links) for products already on screen. */
  const refreshCards = useCallback((fresh: FeaturedPrints) => {
    const cards = new Map(fresh.entries.map((entry) => [entry.catalogItemId, entry.card]));
    setEntries((current) =>
      current.map((entry) =>
        cards.has(entry.catalogItemId)
          ? { ...entry, card: cards.get(entry.catalogItemId) ?? null }
          : entry,
      ),
    );
  }, []);

  const load = useCallback(async () => {
    try {
      const fresh = normalizeFeaturedPrints(await getFeaturedPrints());
      setLoadError(null);
      const { saved: current, dirty: editing } = state.current;
      if (!current || !editing) {
        setSaved(fresh);
        setEntries(fresh.entries);
        setUnavailable(new Set());
        setNewer(null);
      } else if (fresh.version !== current.version) {
        setNewer(fresh);
      } else {
        setSaved(fresh);
        refreshCards(fresh);
      }
    } catch (err) {
      if (!state.current.saved) {
        setLoadError(featuredPrintsErrorMessage(err, "Could not load Featured Prints."));
      }
    }
  }, [refreshCards]);

  useLiveReload("catalog", load);

  useEffect(() => {
    const unknown = entries
      .filter((entry) => !entry.card && !(entry.catalogItemId in missingNames))
      .map((entry) => entry.catalogItemId);
    if (!unknown.length) return;
    setMissingNames((current) => ({
      ...current,
      ...Object.fromEntries(unknown.map((id) => [id, null])),
    }));
    for (const id of unknown) {
      getStaffCatalogItem(id)
        .then((body) => {
          const name = normalizeStaffCatalogDetail(body)?.listing.name ?? null;
          if (name) setMissingNames((current) => ({ ...current, [id]: name }));
        })
        .catch(() => {
          // A deleted listing has no name to show; the row says so.
        });
    }
  }, [entries, missingNames]);

  useEffect(() => {
    void load();
  }, [load]);

  const chosenIds = useMemo(() => new Set(idsOf(entries)), [entries]);
  const previewCards = useMemo(
    () =>
      entries.flatMap((entry) =>
        entry.card && !unavailable.has(entry.catalogItemId) ? [entry.card] : [],
      ),
    [entries, unavailable],
  );
  const blocker = saveBlocker({ entries, unavailableIds: unavailable, reason });
  const reasonMissing = triedSave && !reason.trim();
  const reasonTooLong = reason.trim().length > FEATURED_PRINTS_REASON_MAX;

  function add(card: FeaturedCard) {
    setEntries((current) =>
      current.some((entry) => entry.catalogItemId === card.id) ||
      current.length >= FEATURED_PRINTS_MAX
        ? current
        : [...current, { catalogItemId: card.id, card }],
    );
  }

  function remove(id: string) {
    setEntries((current) => current.filter((entry) => entry.catalogItemId !== id));
    setUnavailable((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function move(index: number, by: number) {
    setEntries((current) => moveEntry(current, index, by));
  }

  function discard() {
    if (!saved) return;
    setEntries(saved.entries);
    setUnavailable(new Set());
    setSaveError(null);
    setTriedSave(false);
  }

  function adoptTheirs() {
    if (!newer) return;
    setSaved(newer);
    setEntries(newer.entries);
    setUnavailable(new Set());
    setNewer(null);
    setSaveError(null);
  }

  /** Keep this list, now based on their version, so Save replaces theirs knowingly. */
  function keepMine() {
    if (!newer) return;
    setSaved(newer);
    setNewer(null);
    setSaveError(null);
  }

  async function save() {
    if (!saved) return;
    setTriedSave(true);
    if (blocker) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = normalizeFeaturedPrints(
        await saveFeaturedPrints({
          expectedVersion: saved.version,
          catalogItemIds: idsOf(entries),
          reason: reason.trim(),
        }),
      );
      setSaved(next);
      setEntries(next.entries);
      setReason("");
      setTriedSave(false);
      setUnavailable(new Set());
      toast.add({
        type: "success",
        title: "Featured Prints saved",
        description: next.entries.length
          ? "Clients see the new row the next time Home loads."
          : "Clients see the catalogue prompt instead of a row.",
      });
    } catch (err) {
      const refused = unavailableIdsFrom(err);
      if (refused.length) setUnavailable(new Set(refused));
      if (isApiError(err) && err.code === "featured_prints_version_conflict") {
        try {
          setNewer(normalizeFeaturedPrints(await getFeaturedPrints()));
        } catch {
          // The message below still says to reload.
        }
      }
      setSaveError(featuredPrintsErrorMessage(err, "Featured Prints were not saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (loadError && !saved) {
    return (
      <ErrorState
        title="Featured Prints did not load"
        body={loadError}
        action={
          <Button type="button" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!saved) return <LoadingBlock label="Loading Featured Prints…" />;

  const staleCount = entries.filter(
    (entry) => !entry.card || unavailable.has(entry.catalogItemId),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        The products GRIDGO shows on the client&rsquo;s Home, in this order. Clients see the
        product, its sample photo and GRIDGO&rsquo;s starting price; never the shop that makes it.
      </p>

      {newer ? (
        <Alert>
          <AlertTitle>Someone else saved Featured Prints after you started</AlertTitle>
          <AlertDescription>
            <span className="flex flex-col gap-3">
              <span>
                Their list: {listSummary(newer.entries)}. Choose which list to keep before saving.
              </span>
              <span className="flex flex-wrap gap-2">
                <Button type="button" onClick={adoptTheirs}>
                  Use their list
                </Button>
                <Button type="button" onClick={keepMine}>
                  Keep my changes
                </Button>
              </span>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="featured-prints-row" className="gg-card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="featured-prints-row" className="text-h3 text-text-primary m-0">
                On Home
              </h2>
              <span className="text-caption text-text-muted tabular-nums">
                {entries.length} of {FEATURED_PRINTS_MAX}
              </span>
            </div>
            {entries.length === 0 ? (
              <p className="text-body text-text-secondary m-0">
                Nothing is featured. Add products below, or save an empty row to show clients the
                catalogue prompt.
              </p>
            ) : (
              <ol className="flex list-none flex-col gap-2 p-0 m-0" aria-label="Featured order">
                {entries.map((entry, index) => (
                  <EntryRow
                    key={entry.catalogItemId}
                    entry={entry}
                    position={index + 1}
                    first={index === 0}
                    last={index === entries.length - 1}
                    refused={unavailable.has(entry.catalogItemId)}
                    fallbackName={missingNames[entry.catalogItemId] ?? null}
                    onMove={(by) => move(index, by)}
                    onRemove={() => remove(entry.catalogItemId)}
                    onStalePhoto={() => void load()}
                  />
                ))}
              </ol>
            )}
            {staleCount ? (
              <p className="text-caption text-warning m-0" role="status">
                {staleCount === 1
                  ? "1 product is no longer available to clients. Remove it to save."
                  : `${staleCount} products are no longer available to clients. Remove them to save.`}
              </p>
            ) : null}
          </section>

          <FeaturedPrintsPicker chosenIds={chosenIds} onAdd={add} />
        </div>

        <aside
          aria-labelledby="featured-prints-preview"
          className="flex flex-col gap-4 lg:sticky lg:top-[4.5rem]"
        >
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="featured-prints-preview" className="text-h3 text-text-primary m-0">
                What clients see
              </h2>
              <p className="text-caption text-text-secondary m-0">
                {dirty ? "With your changes. Clients see this once you save." : "On Home now."}
              </p>
            </div>
            <FeaturedPrintsPreview cards={previewCards} onStalePhoto={() => void load()} />
          </section>

          <section aria-label="Save Featured Prints" className="gg-card flex flex-col gap-3 p-4">
            <Field data-invalid={reasonMissing || reasonTooLong || undefined}>
              <FieldLabel htmlFor="featured-prints-reason">Reason for this change</FieldLabel>
              <Textarea
                id="featured-prints-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={reasonMissing || reasonTooLong || undefined}
                placeholder="e.g. Rainy-season tarpaulins first"
                rows={2}
              />
              {reasonMissing ? (
                <FieldError>Say why you are changing Featured Prints.</FieldError>
              ) : reasonTooLong ? (
                <FieldError>
                  Keep the reason to {FEATURED_PRINTS_REASON_MAX.toLocaleString("en-PH")} characters.
                </FieldError>
              ) : (
                <FieldDescription>
                  Kept in the audit log. Operations and Super Admin get a notice when you save.
                </FieldDescription>
              )}
            </Field>
            {saveError ? (
              <p className="text-caption text-error m-0" role="alert">
                {saveError}
              </p>
            ) : blocker && triedSave && !reasonMissing && !reasonTooLong ? (
              <p className="text-caption text-text-secondary m-0" role="status">
                {blocker}
              </p>
            ) : !dirty ? (
              <p className="text-caption text-text-muted m-0">
                Add, remove or reorder products to save a new row.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => void save()}
                disabled={saving || !dirty || Boolean(newer)}
              >
                {saving ? "Saving…" : "Save Featured Prints"}
              </Button>
              {dirty ? (
                <Button type="button" variant="ghost" onClick={discard} disabled={saving}>
                  Discard changes
                </Button>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** "Flyers, Business cards and 2 unavailable" for the conflict notice. */
function listSummary(entries: readonly FeaturedEntry[]): string {
  if (!entries.length) return "nothing featured";
  const names = entries.flatMap((entry) => (entry.card ? [entry.card.name] : []));
  const missing = entries.length - names.length;
  const parts = missing ? [...names, `${missing} unavailable`] : names;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function EntryRow({
  entry,
  position,
  first,
  last,
  refused,
  fallbackName,
  onMove,
  onRemove,
  onStalePhoto,
}: {
  entry: FeaturedEntry;
  fallbackName: string | null;
  position: number;
  first: boolean;
  last: boolean;
  refused: boolean;
  onMove: (by: number) => void;
  onRemove: () => void;
  onStalePhoto: () => void;
}) {
  const card = entry.card;
  const name = card?.name ?? fallbackName ?? "A product that was removed";
  const blocked = !card || refused;
  return (
    <li
      className={
        blocked
          ? "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-warning p-2"
          : "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-outline p-2"
      }
      data-testid="featured-entry"
    >
      <span
        className="text-h3 text-text-muted w-7 shrink-0 text-center tabular-nums"
        aria-label={`Position ${position}`}
      >
        {position}
      </span>
      <div className="w-20 shrink-0">
        <SampleFrame photo={card?.photo ?? null} onStale={onStalePhoto} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className="text-body text-text-primary line-clamp-2"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {name}
        </span>
        {card && !refused ? (
          <span className="text-caption text-text-secondary tabular-nums">
            {clientPriceLine(card)} {clientUnitLine(card)}
          </span>
        ) : (
          <span className="flex flex-col items-start gap-1">
            <StatusChip tone="warning" icon="triangle-alert" label="Not available to clients" />
            <span className="text-caption text-text-muted">
              Hidden, taken down, shop closed or no approved sample. Clients do not see it.
            </span>
          </span>
        )}
      </div>
      {/* Below 768px the controls take their own line, so the name keeps the width. */}
      <div className="flex w-full shrink-0 justify-end gap-1 md:w-auto">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move ${name} earlier`}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move ${name} later`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
    </li>
  );
}
