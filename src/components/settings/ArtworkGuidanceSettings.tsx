"use client";

/**
 * Artwork guidance on Operational settings (gridgo-client#242; contract
 * gridgo-api docs/ARTWORK_GUIDANCE_API.md).
 *
 * Each product type's recommended minimum resolution at the ordered size and
 * whether it takes RGB files, grouped and named as the catalogue names them.
 * A product type without its own target uses the default. Only Super Admin
 * changes them (the API answers anyone else `403`); `canEdit` false draws the
 * same table without inputs, which is how the GRIDGO Team reads it at
 * `/ops/settings`.
 *
 * The card saves on its own, the whole value at once, through the same
 * `expectedVersion` handshake as every settings save. Nothing here refuses a
 * file: a target only decides when the client is warned.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, getTaxonomy, updateSettings } from "@/lib/api/client";
import type { PlatformSettings, Taxonomy } from "@/lib/api/types";
import {
  ARTWORK_DPI_MAX,
  ARTWORK_DPI_MIN,
  DPI_INVALID,
  guidanceChanges,
  guidanceDraft,
  guidanceGroups,
  guidanceReason,
  parseGuidanceDraft,
  parseTarget,
  targetDraft,
  targetLine,
  type GuidanceDraft,
  type TargetDraft,
} from "@/lib/artwork-guidance";
import { cn } from "@/lib/utils";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved?: (next: PlatformSettings) => void;
  onConflict?: () => Promise<void> | void;
  disabled?: boolean;
};

const HEADING_ID = "artwork-guidance-heading";

export function ArtworkGuidanceSettings({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
}: Props) {
  const stored = settings.artworkGuidance;
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [taxonomyFailed, setTaxonomyFailed] = useState(false);
  // Untouched, the table follows refreshed settings; an edit stays a draft
  // until it is saved or discarded, even across a refresh.
  const [draft, setDraft] = useState<GuidanceDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const loadTaxonomy = useCallback(async () => {
    try {
      setTaxonomy(await getTaxonomy());
      setTaxonomyFailed(false);
    } catch {
      setTaxonomyFailed(true);
    }
  }, []);
  useEffect(() => {
    void loadTaxonomy();
  }, [loadTaxonomy]);

  const groups = useMemo(() => guidanceGroups(taxonomy, stored), [taxonomy, stored]);
  const nameOf = useCallback(
    (code: string) =>
      taxonomy?.subcategories?.find((row) => row.code === code)?.name ?? code,
    [taxonomy],
  );

  if (!stored) {
    return (
      <section className="gg-card p-3" aria-labelledby={HEADING_ID}>
        <Heading />
        <p className="text-body text-text-secondary m-0 mt-3">
          Artwork guidance is not available yet. It appears here once the service is
          updated.
        </p>
      </section>
    );
  }

  const current = draft ?? guidanceDraft(stored);
  const parsed = parseGuidanceDraft(current);
  const changes = parsed.value ? guidanceChanges(stored, parsed.value, nameOf) : [];
  const dirty = draft !== null && (parsed.value === null || changes.length > 0);
  const locked = busy || Boolean(disabled);

  function edit(next: (draft: GuidanceDraft) => GuidanceDraft) {
    setDraft((previous) => next(previous ?? guidanceDraft(stored!)));
    setError(null);
    setOk(null);
  }

  function editTarget(code: string | null, patch: Partial<TargetDraft>) {
    edit((value) =>
      code === null
        ? { ...value, base: { ...value.base, ...patch } }
        : { ...value, own: { ...value.own, [code]: { ...value.own[code], ...patch } } },
    );
  }

  async function save() {
    if (!canEdit || locked || !parsed.value || !changes.length) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        artworkGuidance: parsed.value,
        reason: guidanceReason(changes),
      });
      onSaved?.(saved);
      setDraft(null);
      setOk(
        changes.length === 1
          ? "Artwork guidance saved. 1 change applies to new checkouts."
          : `Artwork guidance saved. ${changes.length} changes apply to new checkouts.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Check the targets in force and your changes before saving again.",
        );
        await onConflict?.();
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change artwork guidance.");
      } else if (
        err instanceof ApiError &&
        err.code === "unknown_artwork_guidance_subcategory"
      ) {
        setError(
          "One of these product types is no longer in the catalogue. Refresh the page and save again.",
        );
      } else if (err instanceof ApiError && err.code === "invalid_artwork_guidance") {
        setError(DPI_INVALID);
      } else {
        setError(opsErrorMessage(err, "Could not save artwork guidance. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby={HEADING_ID} data-testid="artwork-guidance">
      <Heading />
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        The resolution and colour each product type is normally printed at. When a
        client&rsquo;s file falls short, the app warns them before checkout: they upload a
        better file or accept the warning, and the GRIDGO Team sees which at the quality
        check. No file is refused for this.
      </p>
      <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">
        Resolution is judged at the size the client ordered, not the DPI written in the
        file. Orders already placed keep the targets they were checked against.
      </p>

      <div className="mt-3 flex flex-col gap-4">
        <TargetRow
          name="Default"
          note="For product types without their own target, including any added later."
          draft={current.base}
          storedLine={targetLine(stored.default)}
          changed={draft !== null && !sameDraft(current.base, targetDraft(stored.default))}
          canEdit={canEdit}
          locked={locked}
          onChange={(patch) => editTarget(null, patch)}
          emphasis
        />

        {taxonomyFailed ? (
          <p className="text-body text-text-secondary m-0" role="alert">
            Could not load the catalogue&rsquo;s product types.{" "}
            <Button variant="link" className="h-auto p-0" onClick={() => void loadTaxonomy()}>
              Try again
            </Button>
          </p>
        ) : !taxonomy ? (
          <p className="text-body text-text-secondary m-0" role="status">
            Loading product types…
          </p>
        ) : null}

        {groups.map((group) => (
          <div key={group.code} className="flex flex-col" role="group" aria-labelledby={`ag-group-${group.code}`}>
            <h3
              id={`ag-group-${group.code}`}
              className="text-body font-medium text-text-primary m-0 border-b border-outline pb-1.5"
            >
              {group.name}
            </h3>
            <ul className="m-0 flex list-none flex-col p-0">
              {group.rows.map((row) => {
                const own = current.own[row.code];
                const storedOwn = stored.subcategories[row.code];
                return (
                  <li key={row.code} className="border-b border-outline-subtle last:border-b-0">
                    {own ? (
                      <TargetRow
                        name={row.name}
                        retired={row.retired}
                        draft={own}
                        storedLine={storedOwn ? targetLine(storedOwn) : null}
                        changed={
                          draft !== null &&
                          (!storedOwn || !sameDraft(own, targetDraft(storedOwn)))
                        }
                        canEdit={canEdit}
                        locked={locked}
                        onChange={(patch) => editTarget(row.code, patch)}
                        sameAsDefault={sameDraft(own, current.base)}
                        onUseDefault={() =>
                          edit((value) => {
                            const rest = { ...value.own };
                            delete rest[row.code];
                            return { ...value, own: rest };
                          })
                        }
                      />
                    ) : (
                      <InheritedRow
                        name={row.name}
                        retired={row.retired}
                        line={parseTarget(current.base) ? targetLine(parseTarget(current.base)!) : null}
                        changed={draft !== null && Boolean(storedOwn)}
                        canEdit={canEdit}
                        locked={locked}
                        onSetOwn={() =>
                          edit((value) => ({
                            ...value,
                            own: { ...value.own, [row.code]: { ...value.base } },
                          }))
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {canEdit ? (
        <div className="mt-4 flex flex-col gap-2">
          {dirty && changes.length ? (
            <div className="text-body text-text-secondary" data-testid="artwork-guidance-changes">
              <p className="m-0">
                {changes.length === 1 ? "1 change to save:" : `${changes.length} changes to save:`}
              </p>
              <ul className="m-0 mt-1 flex flex-col gap-0.5 pl-5">
                {changes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {parsed.invalid.length ? (
            <p className="text-body text-error m-0" role="alert">
              {DPI_INVALID}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={locked || !dirty || !parsed.value}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save artwork guidance"}
            </Button>
            <Button
              variant="ghost"
              disabled={locked || draft === null}
              onClick={() => {
                setDraft(null);
                setError(null);
                setOk(null);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-caption text-text-muted m-0 mt-3">Only Super Admin changes these.</p>
      )}
      {ok ? (
        <p className="text-body text-success m-0 mt-3" role="status">
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="text-body text-error m-0 mt-3" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Heading() {
  return (
    <h2 id={HEADING_ID} className="text-h3 text-text-primary m-0">
      Artwork guidance
    </h2>
  );
}

function sameDraft(a: TargetDraft, b: TargetDraft): boolean {
  return a.check === b.check && a.acceptsRgb === b.acceptsRgb && (!a.check || a.dpi.trim() === b.dpi);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function RowName({
  name,
  note,
  retired,
  changed,
}: {
  name: string;
  note?: string;
  retired?: boolean;
  changed?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-body text-text-primary">{name}</span>
        {retired ? <StatusChip tone="neutral" icon="ban" label="Retired" /> : null}
        {changed ? <StatusChip tone="info" icon="square-pen" label="Changed" /> : null}
      </span>
      {note ? <span className="text-caption text-text-muted">{note}</span> : null}
    </div>
  );
}

// Name, resolution, colour, then the way back to the default, kept together
// so a wide screen does not strand the controls far from the name they set.
const ROW_GRID =
  "grid gap-2 py-2.5 md:grid-cols-[minmax(0,17rem)_13rem_15rem_minmax(0,1fr)] md:items-center";

// The chosen colour reads as filled, not as a faint wash beside its twin.
const COLOUR_CHOICE =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:aria-pressed:bg-primary hover:aria-pressed:text-primary-foreground";

function TargetRow({
  name,
  note,
  retired,
  draft,
  storedLine,
  changed,
  canEdit,
  locked,
  onChange,
  onUseDefault,
  sameAsDefault = false,
  emphasis = false,
}: {
  name: string;
  note?: string;
  retired?: boolean;
  draft: TargetDraft;
  storedLine: string | null;
  changed: boolean;
  canEdit: boolean;
  locked: boolean;
  onChange: (patch: Partial<TargetDraft>) => void;
  onUseDefault?: () => void;
  /** Its own entry already matches the default: nothing to go back to. */
  sameAsDefault?: boolean;
  emphasis?: boolean;
}) {
  const id = `ag-${slug(name)}`;
  const target = parseTarget(draft);
  const invalid = draft.check && !target;

  if (!canEdit) {
    return (
      <div className={cn(ROW_GRID, emphasis && "rounded-card bg-surface-variant px-3")}>
        <RowName name={name} note={note} retired={retired} />
        <span className="text-body text-text-primary">
          {draft.check ? `${draft.dpi} DPI minimum` : "No resolution check"}
        </span>
        <span className="text-body text-text-primary">
          {draft.acceptsRgb ? "RGB accepted" : "Expects CMYK"}
        </span>
        <span />
      </div>
    );
  }

  return (
    <div
      className={cn(ROW_GRID, emphasis && "rounded-card bg-surface-variant px-3")}
      data-testid={`artwork-target-${slug(name)}`}
    >
      <RowName name={name} note={note} retired={retired} changed={changed} />
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          id={`${id}-check`}
          checked={draft.check}
          disabled={locked}
          aria-label={`Check resolution for ${name}`}
          onCheckedChange={(checked) =>
            onChange({ check: Boolean(checked), dpi: draft.dpi || "300" })
          }
        />
        {draft.check ? (
          <span className="flex items-center gap-1.5">
            <Input
              id={`${id}-dpi`}
              inputMode="numeric"
              className="w-20"
              value={draft.dpi}
              disabled={locked}
              aria-label={`Minimum DPI for ${name}`}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${id}-dpi-error` : undefined}
              onChange={(event) => onChange({ dpi: event.target.value })}
            />
            <span className="text-body text-text-secondary">DPI</span>
          </span>
        ) : (
          <span className="text-body text-text-secondary">No resolution check</span>
        )}
        {invalid ? (
          <span id={`${id}-dpi-error`} className="text-caption text-error basis-full">
            {ARTWORK_DPI_MIN} to {ARTWORK_DPI_MAX}
          </span>
        ) : null}
      </div>
      <ToggleGroup
        value={[draft.acceptsRgb ? "rgb" : "cmyk"]}
        onValueChange={(values) => {
          const next = values[0];
          if (next) onChange({ acceptsRgb: next === "rgb" });
        }}
        variant="outline"
        spacing={0}
        disabled={locked}
        aria-label={`Colour for ${name}`}
        className="flex"
      >
        <ToggleGroupItem value="cmyk" className={COLOUR_CHOICE}>
          Expects CMYK
        </ToggleGroupItem>
        <ToggleGroupItem value="rgb" className={COLOUR_CHOICE}>
          RGB accepted
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="flex">
        {onUseDefault && !sameAsDefault ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={locked}
            onClick={onUseDefault}
            aria-label={`Use the default for ${name}`}
          >
            Use default
          </Button>
        ) : null}
      </div>
      {changed && storedLine ? (
        <span className="text-caption text-text-muted md:col-span-4">
          In force right now: {storedLine}
        </span>
      ) : null}
    </div>
  );
}

function InheritedRow({
  name,
  retired,
  line,
  changed,
  canEdit,
  locked,
  onSetOwn,
}: {
  name: string;
  retired?: boolean;
  line: string | null;
  changed: boolean;
  canEdit: boolean;
  locked: boolean;
  onSetOwn: () => void;
}) {
  return (
    <div className={ROW_GRID}>
      <RowName name={name} retired={retired} changed={changed} />
      <span className="text-body text-text-secondary md:col-span-2">
        Uses the default{line ? ` (${line})` : ""}
      </span>
      <div className="flex">
        {canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={locked}
            onClick={onSetOwn}
            aria-label={`Set a target for ${name}`}
          >
            Set its own
          </Button>
        ) : null}
      </div>
    </div>
  );
}
