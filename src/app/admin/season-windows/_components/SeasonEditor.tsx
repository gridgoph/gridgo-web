"use client";

import { useState } from "react";

import {
  DEMAND_LEVELS,
  EMPTY_DRAFT,
  SEASON_LIMITS,
  bannerIntervalFor,
  bannerTiming,
  changedFields,
  draftFromWindow,
  inputFromDraft,
  isDayKey,
  reachPhrase,
  seasonErrorMessage,
  seasonErrorNeedsReload,
  seasonFieldError,
  validateSeasonDraft,
  type SeasonDraft,
  type SeasonErrors,
} from "@/app/admin/_lib/season-windows";
import {
  ClientBannerPreview,
  SeasonLevelTag,
  SeasonRunway,
} from "@/app/admin/season-windows/_components/SeasonVisuals";
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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { createSeasonWindow, updateSeasonWindow } from "@/lib/api/client";
import type { SeasonDemandLevel, SeasonPushDryRun, SeasonWindow } from "@/lib/api/types";

type Props = {
  /** `"new"` to add, a window to edit, `null` when closed. */
  editing: SeasonWindow | "new" | null;
  today: string;
  pushEnabled: boolean;
  dryRun: SeasonPushDryRun | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  /** The list is stale (409/404): re-read it. */
  onStale: () => void;
};

export function SeasonEditor(props: Props) {
  const { editing, onClose } = props;
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {editing !== null ? (
        <EditorBody
          key={editing === "new" ? "new" : `${editing.id}:${editing.version}`}
          {...props}
          editing={editing}
        />
      ) : null}
    </Dialog>
  );
}

function EditorBody({
  editing,
  today,
  pushEnabled,
  dryRun,
  onClose,
  onSaved,
  onStale,
}: Props & { editing: SeasonWindow | "new" }) {
  const isNew = editing === "new";
  const [draft, setDraft] = useState<SeasonDraft>(
    isNew ? EMPTY_DRAFT : draftFromWindow(editing),
  );
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<SeasonErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localErrors = validateSeasonDraft(draft);
  const errors: SeasonErrors = { ...(attempted ? localErrors : {}), ...serverErrors };

  function set<K extends keyof SeasonDraft>(key: K, value: SeasonDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  const hasStart = isDayKey(draft.startDate);
  const hasRange = hasStart && isDayKey(draft.endDate) && draft.endDate >= draft.startDate;
  const interval = hasStart ? bannerIntervalFor(draft.startDate) : null;
  const startMoved = isNew || draft.startDate !== editing.startDate;
  const timing = interval ? bannerTiming(interval, today, { isNew: startMoved }) : null;
  const noticeSent = !isNew && Boolean(editing.noticeQueuedAt);
  const level = (draft.demandLevel || "Normal") as SeasonDemandLevel;
  const previewDay =
    timing?.phase === "ahead" && interval ? interval.startDate : today;
  const sendsOnSave =
    pushEnabled && !noticeSent && timing?.phase === "showing" && dryRun !== null;

  async function save() {
    setAttempted(true);
    if (Object.keys(localErrors).length > 0) return;
    const input = inputFromDraft(draft);
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        await createSeasonWindow(input);
        onSaved(`${input.name} added.`);
      } else {
        const changes = changedFields(editing, input);
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await updateSeasonWindow(editing.id, editing.version, changes);
        onSaved(`${input.name} saved.`);
      }
    } catch (err) {
      const pinned = seasonFieldError(err);
      if (pinned) setServerErrors({ [pinned.field]: pinned.message });
      setError(seasonErrorMessage(err, "The season was not saved. Try again."));
      if (seasonErrorNeedsReload(err)) onStale();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{isNew ? "Add season window" : `Edit ${editing.name}`}</DialogTitle>
        <DialogDescription>
          Clients see the name and message on their deadline calendar and, six to
          four weeks before the season starts, on their home screen. No date is
          blocked.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <FieldGroup>
          <Field data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor="season-name">Name</FieldLabel>
            <Input
              id="season-name"
              value={draft.name}
              maxLength={SEASON_LIMITS.name}
              aria-invalid={errors.name ? true : undefined}
              onChange={(e) => set("name", e.target.value)}
              placeholder="For example, Graduation season"
              autoComplete="off"
            />
            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={errors.startDate ? true : undefined}>
              <FieldLabel htmlFor="season-start">First day</FieldLabel>
              <Input
                id="season-start"
                type="date"
                value={draft.startDate}
                aria-invalid={errors.startDate ? true : undefined}
                onChange={(e) => set("startDate", e.target.value)}
              />
              {errors.startDate ? <FieldError>{errors.startDate}</FieldError> : null}
            </Field>
            <Field data-invalid={errors.endDate ? true : undefined}>
              <FieldLabel htmlFor="season-end">Last day</FieldLabel>
              <Input
                id="season-end"
                type="date"
                value={draft.endDate}
                min={hasStart ? draft.startDate : undefined}
                aria-invalid={errors.endDate ? true : undefined}
                onChange={(e) => set("endDate", e.target.value)}
              />
              {errors.endDate ? <FieldError>{errors.endDate}</FieldError> : null}
            </Field>
          </div>
          <FieldDescription className="-mt-2">
            Both days count, in Philippine time.
          </FieldDescription>

          <Field data-invalid={errors.demandLevel ? true : undefined}>
            <FieldLabel id="season-level-label">How busy shops get</FieldLabel>
            <RadioGroup
              aria-labelledby="season-level-label"
              value={draft.demandLevel}
              onValueChange={(value) => set("demandLevel", String(value) as SeasonDemandLevel)}
            >
              {DEMAND_LEVELS.map((choice) => (
                <label
                  key={choice.value}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2.5"
                >
                  <RadioGroupItem value={choice.value} className="mt-1" />
                  <span className="min-w-0">
                    <SeasonLevelTag level={choice.value} />
                    <span className="text-caption text-text-muted block">{choice.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errors.demandLevel ? <FieldError>{errors.demandLevel}</FieldError> : null}
          </Field>

          <Field data-invalid={errors.message ? true : undefined}>
            <FieldLabel htmlFor="season-message">Message to clients</FieldLabel>
            <Textarea
              id="season-message"
              value={draft.message}
              rows={3}
              maxLength={SEASON_LIMITS.message}
              aria-invalid={errors.message ? true : undefined}
              onChange={(e) => set("message", e.target.value)}
              placeholder="For example, Shops fill up fast before graduation. Order early."
            />
            <FieldDescription>
              {draft.message.trim().length} of {SEASON_LIMITS.message} characters. Every
              client can read this, so keep it general: no names, orders or prices.
            </FieldDescription>
            {errors.message ? <FieldError>{errors.message}</FieldError> : null}
          </Field>
        </FieldGroup>

        <div className="flex min-w-0 flex-col gap-3">
          <section className="gg-panel flex flex-col gap-2 p-3" aria-labelledby="season-when">
            <h3 id="season-when" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
              When clients see it
            </h3>
            {timing && interval ? (
              <>
                <div>
                  <StatusChip tone={timing.tone} icon={timing.icon} label={timing.chip} />
                </div>
                <p className="text-body text-text-primary m-0">{timing.headline}</p>
                <p className="text-caption text-text-muted m-0">{timing.detail}</p>
                {hasRange ? (
                  <SeasonRunway
                    bannerStart={interval.startDate}
                    bannerEnd={interval.endDate}
                    startDate={draft.startDate}
                    endDate={draft.endDate}
                    level={level}
                    today={today}
                  />
                ) : null}
              </>
            ) : (
              <p className="text-caption text-text-muted m-0">
                Choose the first day to see when the home banner starts. It shows
                from six weeks to four weeks before.
              </p>
            )}
            {noticeSent ? (
              <p className="text-caption text-text-muted m-0">
                This season&apos;s notice already went out. Edits change the banner
                and calendar only; nothing is sent again.
              </p>
            ) : null}
          </section>

          {sendsOnSave && dryRun ? (
            <div
              className="flex flex-col items-start gap-2 rounded-card border border-warning p-3"
              role="status"
            >
              <StatusChip tone="warning" icon="triangle-alert" label="Sends within a minute" />
              <p className="text-body text-text-primary m-0">
                Notices are on and this banner is showing now, so saving sends its
                notice to {reachPhrase(dryRun.eligibleClients, dryRun.eligibleDevices)}.
              </p>
            </div>
          ) : null}

          <section className="flex flex-col gap-2" aria-labelledby="season-preview">
            <h3 id="season-preview" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
              On a client&apos;s home screen
            </h3>
            {draft.name.trim() && hasRange && draft.message.trim() ? (
              <ClientBannerPreview
                name={draft.name.trim()}
                startDate={draft.startDate}
                endDate={draft.endDate}
                level={level}
                message={draft.message.trim()}
                asOf={previewDay}
              />
            ) : (
              <p className="text-caption text-text-muted m-0 rounded-card border border-dashed border-outline p-3">
                The banner appears here once the season has a name, dates and a
                message.
              </p>
            )}
            {timing?.phase === "ahead" && draft.name.trim() && hasRange && draft.message.trim() ? (
              <p className="text-caption text-text-muted m-0">
                As it reads on its first day. The count shortens each day.
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : isNew ? "Add season" : "Save changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
