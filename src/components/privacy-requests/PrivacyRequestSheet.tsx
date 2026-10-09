"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { updatePrivacyRequest } from "@/lib/api/client";
import type { PrivacyRequest, PrivacyRequestStatus, User } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatManila } from "@/lib/legal";
import {
  PRIVACY_KIND_LABEL,
  PRIVACY_KIND_TASK,
  PRIVACY_STATUSES,
  PRIVACY_TEXT_LIMIT,
  dueChip,
  isoToManilaDay,
  manilaDayToDueIso,
  needsResolution,
  privacyErrorMessage,
  privacyStatusChip,
  privacyStatusLabel,
} from "@/lib/privacy-requests";
import { roleLabel } from "@/lib/routes";

type Props = {
  tree: "admin" | "ops";
  request: PrivacyRequest | null;
  requester: User | null;
  staff: readonly User[];
  now: number;
  onClose: () => void;
  onSaved: (request: PrivacyRequest) => void;
  /** The request moved underneath us: re-read the queue. */
  onStale: () => void;
};

const UNASSIGNED = "__nobody__";

const STATUS_HINT: Record<PrivacyRequestStatus, string> = {
  pending: "Not started.",
  in_progress: "Someone is working on it.",
  completed: "Done. Say what was done.",
  rejected: "Not done. Say why, for example the person could not be confirmed.",
};

export function PrivacyRequestSheet(props: Props) {
  const { request, onClose } = props;
  return (
    <Sheet
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        {request ? <Body key={`${request.id}:${request.revision}`} {...props} request={request} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({ tree, request, requester, staff, now, onSaved, onStale }: Props & { request: PrivacyRequest }) {
  const { user: me } = useAuth();
  const [status, setStatus] = useState<PrivacyRequestStatus>(request.status);
  const [handlerId, setHandlerId] = useState<string | null>(request.handlerId);
  const [dueDay, setDueDay] = useState(isoToManilaDay(request.dueAt));
  const [resolution, setResolution] = useState(request.resolution);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlers = useMemo(() => {
    const list = [...staff];
    // A handler from before a role change still reads by name.
    if (request.handlerId && !list.some((user) => user.id === request.handlerId)) {
      list.push({ id: request.handlerId, name: request.handlerId, email: "", role: "ops_admin" });
    }
    return list;
  }, [staff, request.handlerId]);
  const handlerName = (id: string | null) =>
    id ? handlers.find((user) => user.id === id)?.name || "Unknown staff" : "Nobody yet";

  const resolutionError =
    needsResolution(status) && !resolution.trim()
      ? "Write what was done. The requester reads this."
      : resolution.length > PRIVACY_TEXT_LIMIT
        ? `Keep it within ${PRIVACY_TEXT_LIMIT.toLocaleString("en-PH")} characters.`
        : null;
  const dueIso = manilaDayToDueIso(dueDay);
  const dueError = dueIso ? null : "Choose a due date.";
  const dueMoved = dueIso && isoToManilaDay(dueIso) !== isoToManilaDay(request.dueAt);

  const patch: Parameters<typeof updatePrivacyRequest>[1] = { expectedRevision: request.revision };
  if (status !== request.status) patch.status = status;
  if (handlerId !== request.handlerId) patch.handlerId = handlerId;
  if (dueMoved) patch.dueAt = dueIso;
  if (resolution !== request.resolution) patch.resolution = resolution;
  const dirty = Object.keys(patch).length > 1;

  async function save() {
    setAttempted(true);
    if (resolutionError || dueError || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const result = await updatePrivacyRequest(request.id, patch);
      onSaved(result.request);
      toast.add({
        type: "success",
        title: "Request updated",
        description: `${PRIVACY_KIND_LABEL[request.kind]} is now ${privacyStatusLabel(result.request.status).toLowerCase()}.`,
      });
    } catch (err) {
      setError(privacyErrorMessage(err, "The request was not updated. Try again."));
      onStale();
    } finally {
      setBusy(false);
    }
  }

  const due = dueChip(request, now);
  const requesterName = requester?.name || requester?.email || request.userId;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <SheetHeader className="gap-2 p-0 pr-10">
        <SheetTitle>
          <span className="text-h3 text-text-primary">{PRIVACY_KIND_LABEL[request.kind]}</span>
        </SheetTitle>
        <SheetDescription>
          <span className="text-body text-text-secondary">
            From {requesterName}, {formatManila(request.requestedAt)}
          </span>
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip {...privacyStatusChip(request.status)} />
          {due ? <StatusChip {...due} /> : null}
        </div>
      </SheetHeader>

      <section className="flex flex-col gap-1" aria-labelledby="privacy-requester">
        <h3 id="privacy-requester" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
          Requester
        </h3>
        <p className="text-body text-text-primary m-0">{requesterName}</p>
        <p className="text-caption text-text-muted m-0 break-all">
          {requester ? `${roleLabel(requester.role)}${requester.email ? `, ${requester.email}` : ""}. ` : ""}
          Account ID {request.userId}
        </p>
        <Link
          href={`/${tree}/acceptance-log?user=${encodeURIComponent(request.userId)}`}
          className="text-body text-text-secondary inline-flex min-h-11 items-center self-start underline underline-offset-4"
        >
          What they agreed to
        </Link>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="privacy-message">
        <h3 id="privacy-message" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
          Their message
        </h3>
        {request.details.trim() ? (
          <blockquote className="text-body-lg text-text-primary m-0 whitespace-pre-wrap break-words rounded-field border-l-4 border-outline bg-surface-variant p-3">
            {request.details}
          </blockquote>
        ) : (
          <p className="text-body text-text-muted m-0">They did not add a message.</p>
        )}
      </section>

      <section className="gg-panel flex flex-col gap-1" aria-labelledby="privacy-task">
        <h3 id="privacy-task" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
          What to do
        </h3>
        <p className="text-body text-text-secondary m-0">{PRIVACY_KIND_TASK[request.kind]}</p>
        <p className="text-caption text-text-muted m-0">
          The app does none of this for you. Legal acceptance records are never deleted.
        </p>
      </section>

      <FieldGroup>
        <Field>
          <FieldLabel id="privacy-status">Status</FieldLabel>
          <RadioGroup
            aria-labelledby="privacy-status"
            value={status}
            onValueChange={(value) => {
              const next = PRIVACY_STATUSES.find((option) => option === value);
              if (next) setStatus(next);
            }}
            className="grid gap-2 sm:grid-cols-2"
          >
            {PRIVACY_STATUSES.map((option) => (
              <label
                key={option}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2.5 has-[[data-checked]]:border-text-primary"
              >
                <RadioGroupItem value={option} className="mt-1" />
                <span className="min-w-0">
                  <span className="text-body text-text-primary block" style={{ fontFamily: "var(--font-medium)" }}>
                    {privacyStatusLabel(option)}
                  </span>
                  <span className="text-caption text-text-muted block">{STATUS_HINT[option]}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="privacy-handler">Handled by</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={handlerId ?? UNASSIGNED}
              onValueChange={(value) => setHandlerId(!value || value === UNASSIGNED ? null : String(value))}
            >
              <SelectTrigger id="privacy-handler" className="min-h-11 w-full">
                <SelectValue>{(value) => (value === UNASSIGNED ? "Nobody yet" : handlerName(String(value)))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Nobody yet</SelectItem>
                {handlers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name || user.email || user.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {me && handlerId !== me.id ? (
              <Button variant="secondary" className="shrink-0" onClick={() => setHandlerId(me.id)}>
                Assign to me
              </Button>
            ) : null}
          </div>
        </Field>

        <Field data-invalid={attempted && dueError ? true : undefined}>
          <FieldLabel htmlFor="privacy-due">Due</FieldLabel>
          <Input
            id="privacy-due"
            type="date"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            className="sm:max-w-xs"
            aria-invalid={attempted && dueError ? true : undefined}
          />
          <FieldDescription>End of that day, Philippine time.</FieldDescription>
          {attempted && dueError ? <FieldError>{dueError}</FieldError> : null}
        </Field>

        <Field data-invalid={attempted && resolutionError ? true : undefined}>
          <FieldLabel htmlFor="privacy-resolution">
            Your answer to them{needsResolution(status) ? "" : " (optional for now)"}
          </FieldLabel>
          <Textarea
            id="privacy-resolution"
            value={resolution}
            rows={5}
            maxLength={PRIVACY_TEXT_LIMIT}
            aria-invalid={attempted && resolutionError ? true : undefined}
            onChange={(e) => setResolution(e.target.value)}
            placeholder={
              request.kind === "deletion"
                ? "For example, We deleted your account and personal details. Invoices are kept because the law requires them."
                : "For example, We emailed a copy of your data to the address on your account."
            }
          />
          <FieldDescription>
            The requester reads this in their app, word for word. Say what was
            done and which records were kept and why.
          </FieldDescription>
          {attempted && resolutionError ? <FieldError>{resolutionError}</FieldError> : null}
        </Field>
      </FieldGroup>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button variant="primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {!dirty ? <span className="text-caption text-text-muted">No changes yet.</span> : null}
      </div>
      <p className="text-caption text-text-muted m-0">
        Last updated {formatManila(request.updatedAt)}. Every change is kept in the audit log.
      </p>
    </div>
  );
}
