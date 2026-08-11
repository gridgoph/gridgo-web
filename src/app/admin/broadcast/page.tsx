"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AUDIENCE_CHOICES,
  BROADCAST_LIMITS,
  EXAMPLE_DESTINATION,
  audienceLabel,
  audienceReach,
  broadcastErrorMessage,
  describeAge,
  describeLinkRule,
  findRecentDuplicate,
  phrasePhones,
  presentDelivery,
  validateDestination,
} from "@/app/admin/_lib/broadcasts";
import { LockScreenPreview } from "@/app/admin/broadcast/LockScreenPreview";
import { RecentSends } from "@/app/admin/broadcast/RecentSends";
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
import {
  getBroadcastAudienceSize,
  listBroadcasts,
  sendBroadcast,
} from "@/lib/api/client";
import type { Broadcast, BroadcastAudience } from "@/lib/api/types";

type CountState = "idle" | "loading" | "ready" | "error";
type DestinationMode = "link" | "app";

const RECENT_LIMIT = 6;

/**
 * The megaphone.
 *
 * One press puts a notification on the lock screen of every phone in the
 * chosen audience, and there is no unsend. So this screen is not built to make
 * sending fast — it is built so that a mistake takes work:
 *
 * - no audience is pre-selected, and "Everyone" sits last;
 * - the device count is read live from the API and sending is blocked until it
 *   is known, because "Send" and "Send to 1,240 phones" are different presses;
 * - the destination is checked against GRIDGO's own domain before it is offered;
 * - recent sends sit beside the compose fields, and an identical one raises a
 *   warning;
 * - the confirmation restates the audience, the count and the link, and for
 *   "Everyone" it asks for the word to be typed.
 */
export default function AdminBroadcastPage() {
  const [audience, setAudience] = useState<BroadcastAudience | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [destinationMode, setDestinationMode] = useState<DestinationMode>("link");
  const [link, setLink] = useState("");
  const [linkTouched, setLinkTouched] = useState(false);

  const [recent, setRecent] = useState<Broadcast[] | null>(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);

  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [countState, setCountState] = useState<CountState>("idle");
  const [countError, setCountError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<Broadcast | null>(null);

  // Relative ages are only meaningful against a clock the whole screen shares,
  // and reading one during render would not survive hydration.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    setRecentError(null);
    try {
      setRecent(await listBroadcasts(RECENT_LIMIT));
      // Re-read the clock with the list, so "4 minutes ago" is measured against
      // now and not against whenever this screen was opened.
      setNowMs(Date.now());
    } catch (err) {
      setRecent(null);
      setRecentError(
        broadcastErrorMessage(
          err,
          "Could not read what has already been broadcast.",
          "read",
        ),
      );
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const loadDeviceCount = useCallback(async (target: BroadcastAudience) => {
    setCountState("loading");
    setCountError(null);
    try {
      const size = await getBroadcastAudienceSize(target);
      setDeviceCount(size.deviceCount);
      setCountState("ready");
    } catch (err) {
      setDeviceCount(null);
      setCountState("error");
      setCountError(
        broadcastErrorMessage(
          err,
          "Could not read how many phones this audience has.",
          "read",
        ),
      );
    }
  }, []);

  useEffect(() => {
    if (!audience) {
      setCountState("idle");
      setDeviceCount(null);
      return;
    }
    void loadDeviceCount(audience);
  }, [audience, loadDeviceCount]);

  const destination = useMemo(
    () => (destinationMode === "link" ? validateDestination(link) : null),
    [destinationMode, link],
  );
  const destinationRejected =
    destinationMode === "link" && linkTouched && destination?.ok === false;

  const duplicate = useMemo(() => {
    if (!recent || nowMs === null) return null;
    return findRecentDuplicate({ title, body, audience }, recent, nowMs);
  }, [recent, nowMs, title, body, audience]);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();

  const missing: string[] = [];
  if (!audience) missing.push("choose who this reaches");
  if (!trimmedTitle) missing.push("write a title");
  if (!trimmedBody) missing.push("write the message");
  if (destinationMode === "link" && destination?.ok !== true) {
    missing.push("give a link this can send, or switch it to open the app");
  }

  const noPhones = countState === "ready" && deviceCount === 0;
  const canReview =
    missing.length === 0 &&
    countState === "ready" &&
    deviceCount !== null &&
    deviceCount > 0;

  const needsTypedWord = audience === "all";
  const confirmWord = "EVERYONE";
  const canSend =
    canReview && (!needsTypedWord || typedConfirm.trim() === confirmWord);

  async function send() {
    if (!audience || !canSend) return;
    setBusy(true);
    setSendError(null);
    try {
      const sent = await sendBroadcast({
        title: trimmedTitle,
        body: trimmedBody,
        audience,
        ...(destination?.ok ? { url: destination.url } : {}),
      });
      setResult(sent);
      setConfirmOpen(false);
      setTypedConfirm("");
      // Clear the composed message. Leaving it on screen after a send is how
      // the same broadcast goes out twice.
      setAudience(null);
      setTitle("");
      setBody("");
      setLink("");
      setLinkTouched(false);
      void loadRecent();
    } catch (err) {
      setSendError(
        broadcastErrorMessage(
          err,
          "The broadcast service did not respond. Check recent sends before trying again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const resultDelivery = result
    ? presentDelivery(result.deliveredCount, result.failedCount)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        A broadcast puts a notification on the lock screen of every phone in the
        audience you pick. It cannot be recalled, edited or deleted once it goes
        out.
      </p>

      {result && resultDelivery ? (
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
              tone={resultDelivery.tone}
              label={resultDelivery.label}
              icon={resultDelivery.icon}
            />
          </div>
          <p className="text-body text-text-secondary m-0 max-w-prose">
            {resultDelivery.detail}
          </p>
          <p className="text-body text-text-primary m-0 max-w-prose">
            “{result.title}”
          </p>
          <Button variant="secondary" onClick={() => setResult(null)}>
            Write another
          </Button>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* ── Compose ─────────────────────────────────────────────────── */}
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
                setAudience(String(value) as BroadcastAudience);
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
                  maxLength={BROADCAST_LIMITS.title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="GRIDGO 2.0 is here"
                  autoComplete="off"
                />
                <FieldDescription>
                  {title.length} of {BROADCAST_LIMITS.title} characters. The
                  first line a phone shows.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="broadcast-body">Message</FieldLabel>
                <Textarea
                  id="broadcast-body"
                  value={body}
                  maxLength={BROADCAST_LIMITS.body}
                  rows={4}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Faster quotes and live delivery tracking. Update from the download page."
                  required
                />
                <FieldDescription>
                  {body.length} of {BROADCAST_LIMITS.body} characters. Put what
                  matters first — a phone cuts the rest.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </section>

          <section className="gg-card flex flex-col gap-4" aria-labelledby="destination">
            <div>
              <h2 id="destination" className="text-h3 text-text-primary m-0">
                Where tapping it goes
              </h2>
              <p className="text-caption text-text-muted m-0 mt-1">
                {describeLinkRule()} Anywhere else is refused: people open this
                because GRIDGO sent it, and an outside address would trade on
                that.
              </p>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="destination-mode">Destination</FieldLabel>
                <RadioGroup
                  id="destination-mode"
                  value={destinationMode}
                  onValueChange={(value) => {
                    setDestinationMode(String(value) as DestinationMode);
                    setSendError(null);
                  }}
                >
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2.5">
                    <RadioGroupItem value="link" className="mt-1" />
                    <span className="min-w-0">
                      <span className="text-body text-text-primary block">
                        A GRIDGO web page
                      </span>
                      <span className="text-caption text-text-muted block">
                        Opens in the browser, for example the app download page.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline-subtle px-3 py-2.5">
                    <RadioGroupItem value="app" className="mt-1" />
                    <span className="min-w-0">
                      <span className="text-body text-text-primary block">
                        Just open the app
                      </span>
                      <span className="text-caption text-text-muted block">
                        No link. Right for news that needs no follow-up.
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </Field>

              {destinationMode === "link" ? (
                <Field data-invalid={destinationRejected || undefined}>
                  <FieldLabel htmlFor="broadcast-link">Link</FieldLabel>
                  <Input
                    id="broadcast-link"
                    value={link}
                    inputMode="url"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={destinationRejected || undefined}
                    aria-describedby="broadcast-link-note"
                    onChange={(e) => setLink(e.target.value)}
                    onBlur={() => setLinkTouched(true)}
                    placeholder={EXAMPLE_DESTINATION}
                  />
                  {/* Quiet until it has something to say. The rule is stated
                      once above and the example lives in the placeholder —
                      repeating it a third time here taught nobody anything. */}
                  {destinationRejected && destination && !destination.ok ? (
                    <FieldDescription id="broadcast-link-note">
                      {destination.reason}
                    </FieldDescription>
                  ) : destination?.ok ? (
                    <FieldDescription id="broadcast-link-note">
                      Tapping the notification opens {destination.url}
                    </FieldDescription>
                  ) : null}
                </Field>
              ) : null}
            </FieldGroup>
          </section>
        </div>

        {/* ── What it looks like, and what already went out ────────────── */}
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <section className="gg-card flex flex-col gap-3" aria-labelledby="preview">
            <h2 id="preview" className="text-h3 text-text-primary m-0">
              On a locked phone
            </h2>
            <LockScreenPreview title={title} body={body} />
          </section>

          <RecentSends
            broadcasts={recent}
            loading={recentLoading}
            error={recentError}
            nowMs={nowMs}
            onRetry={() => void loadRecent()}
            highlightId={result?.id ?? null}
          />
        </div>

        {/* ── Blast radius and the one press that matters ──────────────── */}
        <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2">
          <section
            className="gg-card flex flex-col gap-3"
            aria-labelledby="blast-radius"
          >
            <h2 id="blast-radius" className="text-h3 text-text-primary m-0">
              How far this reaches
            </h2>

            {!audience ? (
              <p className="text-body text-text-secondary m-0">
                Choose who this reaches and GRIDGO will count the phones
                registered for notifications right now.
              </p>
            ) : countState === "loading" ? (
              <p className="text-body text-text-secondary m-0" role="status">
                Counting the phones this would reach…
              </p>
            ) : countState === "error" ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-body text-error m-0" role="alert">
                  {countError}
                </p>
                <p className="text-caption text-text-muted m-0 max-w-prose">
                  Sending is held until this number is known. A broadcast whose
                  size nobody can state is not one anybody should press send on.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadDeviceCount(audience)}
                >
                  Count again
                </Button>
              </div>
            ) : noPhones ? (
              <p className="text-body text-text-secondary m-0 max-w-prose">
                Not one phone among {audienceReach(audience)} is registered for
                notifications, so this would arrive nowhere. Pick another
                audience, or check with engineering that devices are
                registering.
              </p>
            ) : deviceCount !== null ? (
              <>
                <p className="text-display text-text-primary m-0">
                  {phrasePhones(deviceCount)}
                </p>
                <p className="text-body text-text-secondary m-0 max-w-prose">
                  Registered for notifications right now among{" "}
                  {audienceReach(audience)}. Some will be asleep, in a meeting,
                  or riding.
                </p>
              </>
            ) : null}
          </section>

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
                  {describeAge(duplicate.sentAt, nowMs)}
                  {duplicate.sentByName ? `, by ${duplicate.sentByName}` : ""}.
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
              {canReview && deviceCount !== null
                ? `Review and send to ${phrasePhones(deviceCount)}`
                : "Review and send"}
            </Button>
            {missing.length > 0 ? (
              <p className="text-caption text-text-muted m-0">
                Still to do: {missing.join(", ")}.
              </p>
            ) : countState === "loading" ? (
              <p className="text-caption text-text-muted m-0">
                Waiting on the phone count.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── The last thing between a draft and every lock screen ───────── */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setTypedConfirm("");
            setSendError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {deviceCount !== null ? phrasePhones(deviceCount) : "these phones"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This goes to {audience ? audienceLabel(audience) : ""} —{" "}
              {deviceCount !== null ? phrasePhones(deviceCount) : "an unknown number of phones"}{" "}
              registered for notifications right now. There is no unsend, no
              edit and no delete once it leaves.
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

            <div>
              <p className="text-caption text-text-muted m-0">
                Tapping it opens
              </p>
              <p className="text-body text-text-primary m-0 mt-0.5 break-all">
                {destination?.ok ? destination.url : "the GRIDGO app"}
              </p>
            </div>

            {duplicate && nowMs !== null ? (
              <p className="text-body text-warning m-0">
                The same message already went to{" "}
                {audienceLabel(duplicate.audience)}{" "}
                {describeAge(duplicate.sentAt, nowMs)}.
              </p>
            ) : null}

            {needsTypedWord ? (
              <Field>
                <FieldLabel htmlFor="broadcast-confirm">
                  This reaches every customer, print shop and rider. Type{" "}
                  {confirmWord} to confirm.
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
            {/* Cancel takes focus, so a stray Return key does not broadcast. */}
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
                : `Send to ${deviceCount !== null ? phrasePhones(deviceCount) : "these phones"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
