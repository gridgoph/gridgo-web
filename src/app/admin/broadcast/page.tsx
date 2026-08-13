"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ANNOUNCEMENT_LIMITS,
  AUDIENCE_CHOICES,
  announcementErrorMessage,
  audienceHitsStrangers,
  audienceLabel,
  audienceReach,
  describeAge,
  findRecentDuplicate,
  presentAnnouncementReach,
} from "@/app/admin/_lib/broadcasts";
import { LastSend } from "@/app/admin/broadcast/LastSend";
import { LockScreenPreview } from "@/app/admin/broadcast/LockScreenPreview";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { postAnnouncement } from "@/lib/api/client";
import type { Announcement, AnnouncementAudience } from "@/lib/api/types";

const CONFIRM_WORD = "EVERYONE";

/**
 * The megaphone.
 *
 * One press puts a notification on the lock screen of every phone in the
 * chosen audience, and there is no unsend. So this screen is not built to make
 * sending fast — it is built so that a mistake takes work:
 *
 * - no audience is pre-selected, and "Everyone" sits last;
 * - there is no destination URL (a tap opens the app);
 * - there is no pre-send phone count (the API has no such route);
 * - confirmation restates the audience and the wording, and for Everyone it
 *   restates that strangers receive it;
 * - the last send this session sits beside the compose fields.
 */
export default function AdminBroadcastPage() {
  const [audience, setAudience] = useState<AnnouncementAudience | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [lastSend, setLastSend] = useState<Announcement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<Announcement | null>(null);

  // Relative ages are only meaningful against a clock the whole screen shares,
  // and reading one during render would not survive hydration.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const sessionSends = useMemo(
    () => (lastSend ? [lastSend] : []),
    [lastSend],
  );

  const duplicate = useMemo(() => {
    if (nowMs === null) return null;
    return findRecentDuplicate({ title, body, audience }, sessionSends, nowMs);
  }, [sessionSends, nowMs, title, body, audience]);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();

  const missing: string[] = [];
  if (!audience) missing.push("choose who this reaches");
  if (!trimmedTitle) missing.push("write a title");
  if (!trimmedBody) missing.push("write the message");

  const canReview = missing.length === 0;
  const needsTypedWord = audienceHitsStrangers(audience);
  const canSend =
    canReview && (!needsTypedWord || typedConfirm.trim() === CONFIRM_WORD);

  async function send() {
    if (!audience || !canSend) return;
    setBusy(true);
    setSendError(null);
    try {
      const sent = await postAnnouncement({
        audience,
        title: trimmedTitle,
        body: trimmedBody,
      });
      setResult(sent);
      setLastSend(sent);
      setConfirmOpen(false);
      setTypedConfirm("");
      // Clear the composed message. Leaving it on screen after a send is how
      // the same announcement goes out twice.
      setAudience(null);
      setTitle("");
      setBody("");
    } catch (err) {
      setSendError(
        announcementErrorMessage(
          err,
          "The announcement service did not respond. Do not send again until you know whether this one left.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const resultReach = result
    ? presentAnnouncementReach(
        result.notifiedUsers,
        result.unclaimedDevices,
        result.audience,
      )
    : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        An announcement puts a notification on the lock screen of every phone in
        the audience you pick. It cannot be recalled, edited or deleted once it
        goes out.
      </p>

      {result && resultReach ? (
        <section
          className="gg-card flex flex-col items-start gap-3"
          aria-labelledby="send-result"
          role="status"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="send-result" className="text-h3 text-text-primary m-0">
              Sent to {audienceLabel(result.audience)}
            </h2>
            <StatusChip
              tone={resultReach.tone}
              label={resultReach.label}
              icon={resultReach.icon}
            />
          </div>
          <p className="text-body text-text-secondary m-0 max-w-prose">
            {resultReach.detail}
          </p>
          <p className="text-body text-text-primary m-0 max-w-prose">
            “{result.title}”
          </p>
          <p className="text-caption text-text-muted m-0">
            {phraseResultCounts(result.notifiedUsers, result.unclaimedDevices)}
          </p>
          <Button variant="secondary" onClick={() => setResult(null)}>
            Write another
          </Button>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <section className="gg-card flex flex-col gap-4" aria-labelledby="who">
            <div>
              <h2 id="who" className="text-h3 text-text-primary m-0">
                Who this interrupts
              </h2>
              <p className="text-caption text-text-muted m-0 mt-1">
                Nothing is chosen for you. Print shops and riders are working
                when this arrives; customers may not be.
              </p>
            </div>

            <RadioGroup
              aria-labelledby="who"
              value={audience ?? ""}
              onValueChange={(value) => {
                setAudience(String(value) as AnnouncementAudience);
                setTypedConfirm("");
              }}
            >
              {AUDIENCE_CHOICES.map((choice) => (
                <label
                  key={choice.value}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2.5"
                >
                  <RadioGroupItem value={choice.value} className="mt-1" />
                  <span className="min-w-0">
                    <span
                      className="text-body text-text-primary block"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {choice.label}
                    </span>
                    <span className="text-caption text-text-muted block">
                      {choice.reason}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </section>

          <section className="gg-card flex flex-col gap-4" aria-labelledby="message">
            <h2 id="message" className="text-h3 text-text-primary m-0">
              What it says
            </h2>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="broadcast-title">Title</FieldLabel>
                <Input
                  id="broadcast-title"
                  value={title}
                  maxLength={ANNOUNCEMENT_LIMITS.title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="GRIDGO 1.4 is available"
                  autoComplete="off"
                />
                <FieldDescription>
                  {title.length} of {ANNOUNCEMENT_LIMITS.title} characters. The
                  first line a phone shows.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="broadcast-body">Message</FieldLabel>
                <Textarea
                  id="broadcast-body"
                  value={body}
                  maxLength={ANNOUNCEMENT_LIMITS.body}
                  rows={4}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Update from the store. Open the GRIDGO app to install it."
                  required
                />
                <FieldDescription>
                  {body.length} of {ANNOUNCEMENT_LIMITS.body} characters. Put
                  what matters first — a phone cuts the rest.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </section>
        </div>

        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <section aria-labelledby="preview">
            <h2 id="preview" className="sr-only">
              On a locked phone
            </h2>
            <LockScreenPreview
              title={title}
              body={body}
              audience={audience}
            />
          </section>

          <LastSend last={lastSend} nowMs={nowMs} />
        </div>

        <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2">
          {audienceHitsStrangers(audience) ? (
            <div
              className="flex flex-col items-start gap-2 rounded-card border border-warning bg-surface p-4"
              role="status"
            >
              <StatusChip
                tone="warning"
                label="Reaches strangers"
                icon="triangle-alert"
              />
              <p className="text-body text-text-primary m-0 max-w-prose">
                Everyone also lands on phones that have never signed in, or have
                signed out. Those words have to be safe for a stranger holding
                any phone — nothing about an order, a payment, or a person.
              </p>
            </div>
          ) : null}

          {duplicate && nowMs !== null ? (
            <div
              className="flex flex-col items-start gap-2 rounded-card border border-warning bg-surface p-4"
              role="alert"
            >
              <div className="flex flex-wrap items-center gap-3">
                <StatusChip
                  tone="warning"
                  label="Already sent"
                  icon="triangle-alert"
                />
                <p className="text-body text-text-primary m-0">
                  This exact message went to {audienceLabel(duplicate.audience)}{" "}
                  {describeAge(duplicate.at, nowMs)}.
                </p>
              </div>
              <p className="text-body text-text-secondary m-0 max-w-prose">
                Sending it again puts a second copy on the same lock screens.
                Change the wording, or leave it — nobody needs to be told twice.
              </p>
            </div>
          ) : null}

          {sendError ? (
            <p className="text-body text-error m-0" role="alert">
              {sendError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={!canReview}
              onClick={() => {
                setTypedConfirm("");
                setSendError(null);
                setConfirmOpen(true);
              }}
            >
              Review and send
            </Button>
            {missing.length > 0 ? (
              <p className="text-caption text-text-muted m-0">
                Still to do: {missing.join(", ")}.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setTypedConfirm("");
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {audience ? audienceLabel(audience) : "this audience"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {needsTypedWord
                ? `This reaches ${audience ? audienceReach(audience) : "everyone"}. Those words land on phones nobody has signed in on. There is no unsend, no edit and no delete once it leaves.`
                : `This goes to ${audience ? audienceReach(audience) : "this audience"} only — signed-in accounts. Phones that never signed in will not see it. There is no unsend, no edit and no delete once it leaves.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-3">
            <div className="gg-panel flex flex-col gap-1">
              <p
                className="text-body text-text-primary m-0"
                style={{ fontFamily: "var(--font-bold)" }}
              >
                {trimmedTitle}
              </p>
              <p className="text-body text-text-secondary m-0">{trimmedBody}</p>
            </div>

            {duplicate && nowMs !== null ? (
              <p className="text-body text-warning m-0">
                The same message already went to{" "}
                {audienceLabel(duplicate.audience)}{" "}
                {describeAge(duplicate.at, nowMs)}.
              </p>
            ) : null}

            {needsTypedWord ? (
              <Field>
                <FieldLabel htmlFor="broadcast-confirm">
                  This also reaches strangers. Type {CONFIRM_WORD} to confirm.
                </FieldLabel>
                <Input
                  id="broadcast-confirm"
                  value={typedConfirm}
                  onChange={(e) => setTypedConfirm(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            ) : null}

            {sendError ? (
              <p className="text-body text-error m-0" role="alert">
                {sendError}
              </p>
            ) : null}
          </div>

          <AlertDialogFooter>
            {/* Cancel takes focus, so a stray Return key does not send. */}
            <AlertDialogCancel variant="secondary" disabled={busy} autoFocus>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={busy || !canSend}
              onClick={() => void send()}
            >
              {busy
                ? "Sending…"
                : `Send to ${audience ? audienceLabel(audience) : "this audience"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function phraseResultCounts(
  notifiedUsers: number,
  unclaimedDevices: number,
): string {
  return `${notifiedUsers.toLocaleString("en-PH")} signed-in account${
    notifiedUsers === 1 ? "" : "s"
  } notified · ${unclaimedDevices.toLocaleString("en-PH")} unsigned-in phone${
    unclaimedDevices === 1 ? "" : "s"
  }.`;
}
