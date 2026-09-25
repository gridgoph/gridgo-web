"use client";

import { useId, useState } from "react";

import {
  githubEffect,
  TRACKER_STATUSES,
  trackerErrorMessage,
  trackerStatusMeta,
  isTrackerStatus,
  trackerItemName,
} from "@/app/admin/_lib/tracker";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusMark } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { setTrackerStatus } from "@/lib/api/client";
import type { TrackerItem, TrackerStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const NOTE_MAX = 500;

/**
 * The one editable column. Picking a status never saves on its own: a
 * confirmation restates the change and what it does to the GitHub issue, and
 * takes an optional note for the audit log.
 */
export function TrackerStatusSelect({
  item,
  onChanged,
  className,
}: {
  item: TrackerItem;
  onChanged: (item: TrackerItem) => void;
  className?: string;
}) {
  const [target, setTarget] = useState<TrackerStatus | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const current = trackerStatusMeta(item.status);
  const next = target ? trackerStatusMeta(target) : null;

  function close() {
    if (saving) return;
    setTarget(null);
    setNote("");
    setError(null);
  }

  async function confirm() {
    if (!target || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await setTrackerStatus(item, { status: target, note });
      onChanged(updated);
      toast.add({
        type: "success",
        title: `${item.ref} is now ${trackerStatusMeta(updated.status).label}.`,
        description: githubEffect(updated.status),
      });
      setTarget(null);
      setNote("");
    } catch (err) {
      setError(trackerErrorMessage(err, "status"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Select
        value={item.status}
        onValueChange={(value) => {
          if (isTrackerStatus(value) && value !== item.status) setTarget(value);
        }}
      >
        <SelectTrigger
          aria-label={`Status of ${trackerItemName(item)}, ${current.label}`}
          className={cn("min-h-11 w-full min-w-0 bg-card", className)}
        >
          <SelectValue>
            <StatusMark tone={current.tone} icon={current.icon} label={current.label} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="min-w-52">
          <SelectGroup>
            {TRACKER_STATUSES.map((meta) => (
              <SelectItem key={meta.value} value={meta.value} className="min-h-11">
                <StatusMark tone={meta.tone} icon={meta.icon} label={meta.label} />
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <AlertDialog open={target !== null} onOpenChange={(open) => (!open ? close() : undefined)}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <span className="text-h3 text-text-primary">
                Move {item.ref} to {next?.label}?
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription render={<div />}>
              <span className="text-body text-text-secondary block">{item.requirement}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {next ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
              <dt className="text-caption text-text-muted">Now</dt>
              <dd className="m-0 text-body text-text-primary">
                <StatusMark tone={current.tone} icon={current.icon} label={current.label} />
              </dd>
              <dt className="text-caption text-text-muted">After</dt>
              <dd className="m-0 text-body text-text-primary">
                <StatusMark tone={next.tone} icon={next.icon} label={next.label} />
              </dd>
              <dt className="sr-only">On GitHub</dt>
              <dd className="col-span-2 m-0 text-caption text-text-secondary">
                {githubEffect(next.value)}
              </dd>
            </dl>
          ) : null}

          <Field>
            <FieldLabel htmlFor={noteId}>Note (optional)</FieldLabel>
            <Textarea
              id={noteId}
              value={note}
              maxLength={NOTE_MAX}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why it moved, for the audit log"
            />
            <FieldDescription>Kept in the audit log with your name.</FieldDescription>
          </Field>

          {error ? (
            <p role="alert" className="text-caption text-error m-0">
              {error}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep {current.label}</AlertDialogCancel>
            <Button variant="default" disabled={saving} onClick={() => void confirm()}>
              {saving ? "Changing…" : `Move to ${next?.label ?? ""}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
