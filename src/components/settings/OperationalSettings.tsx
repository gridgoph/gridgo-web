"use client";

/**
 * Platform settings held in configuration rather than code: how long a
 * client has to raise an issue after delivery, what delivery costs at each
 * distance, and the GCash plate checkout scans.
 *
 * The band figures shipped as Firstmate's suggestion, not the captain's — the
 * screen says so, because someone has to decide the real ones. One
 * implementation, mounted for Operations and Super Admin alike.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { pesosToMinor } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiBase, getSettings, updateSettings, uploadPaymentQr } from "@/lib/api/client";
import {
  ISSUE_WINDOW_MAX_HOURS,
  ISSUE_WINDOW_MIN_HOURS,
} from "@/lib/api/constraints";
import type { DeliveryFeeBand, PlatformSettings } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";

/**
 * Section copy is the same whether or not the values have arrived, so both the
 * form and its loading view read it from here.
 */
const ISSUE_WINDOW_COPY = (
  <>
    How long a client has after delivery to raise a problem. While it is open a
    claim can hold the supplier&rsquo;s payout; when it closes with nothing
    raised, the order completes and the final 10% retention releases.
  </>
);

const BANDS_COPY = (
  <>
    A fixed fee per distance band, measured from the supplier&rsquo;s shop to
    the delivery address. Each band reaches further than the one above it, and
    the last one covers everything beyond.
  </>
);

const QR_COPY = (
  <>
    The GCash InstaPay plate clients scan at checkout. One receiving wallet for
    the platform. Replacing it here is live — phones pick it up the next time
    checkout loads settings, without an app rebuild.
  </>
);

const HOURS_HELP = (
  <>
    Whole hours, {ISSUE_WINDOW_MIN_HOURS} to {ISSUE_WINDOW_MAX_HOURS}. Applies
    to windows opened from now on — orders already delivered keep the length
    they were given.
  </>
);

/** A band as it is being edited — text, so a half-typed number is not lost. */
type BandDraft = {
  /** Kilometres, or "" for the open-ended final band. */
  maxKm: string;
  feePesos: string;
};

function toDraft(bands: DeliveryFeeBand[]): BandDraft[] {
  return bands.map((band) => ({
    maxKm:
      band.maxDistanceMeters === null
        ? ""
        : String(Math.round(band.maxDistanceMeters / 100) / 10),
    feePesos: (band.feeMinor / 100).toFixed(2),
  }));
}

function describeBand(band: DeliveryFeeBand, previous: number | null): string {
  const from = previous === null ? 0 : previous / 1000;
  if (band.maxDistanceMeters === null) {
    return `Over ${from.toLocaleString("en-PH")} km`;
  }
  const to = band.maxDistanceMeters / 1000;
  if (previous === null) return `Up to ${to.toLocaleString("en-PH")} km`;
  return `${from.toLocaleString("en-PH")}–${to.toLocaleString("en-PH")} km`;
}

export function OperationalSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const [hours, setHours] = useState("");
  const [bands, setBands] = useState<BandDraft[]>([]);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrOk, setQrOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getSettings();
      setSettings(next);
      setHours(String(next.issueWindowHours));
      setBands(toDraft(next.deliveryFeeBands));
    } catch (err) {
      setSettings(null);
      setError(
        opsErrorMessage(
          err,
          "Could not load platform settings. Confirm the demo API is running, then retry.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Turn the drafts into what the API wants, or explain what is wrong. */
  function readBands(): { bands: DeliveryFeeBand[] } | { problem: string } {
    if (bands.length === 0) {
      return { problem: "Keep at least one band — every delivery needs a fee." };
    }
    const out: DeliveryFeeBand[] = [];
    let previousMeters = -1;

    for (let i = 0; i < bands.length; i += 1) {
      const draft = bands[i];
      const isLast = i === bands.length - 1;
      const feeMinor = pesosToMinor(draft.feePesos);
      if (feeMinor === null) {
        return {
          problem: `Band ${i + 1} needs a fee in pesos, like 25.00.`,
        };
      }

      if (isLast) {
        if (draft.maxKm.trim() !== "") {
          return {
            problem:
              "The last band covers everything further out, so leave its distance blank.",
          };
        }
        out.push({ maxDistanceMeters: null, feeMinor });
        continue;
      }

      const km = Number(draft.maxKm.trim());
      if (!draft.maxKm.trim() || !Number.isFinite(km) || km <= 0) {
        return {
          problem: `Band ${i + 1} needs a distance in kilometres, like 5.`,
        };
      }
      const meters = Math.round(km * 1000);
      if (meters <= previousMeters) {
        return {
          problem: `Band ${i + 1} must reach further than the one above it.`,
        };
      }
      previousMeters = meters;
      out.push({ maxDistanceMeters: meters, feeMinor });
    }

    return { bands: out };
  }

  async function save() {
    const parsedHours = Number(hours.trim());
    if (
      !Number.isInteger(parsedHours) ||
      parsedHours < ISSUE_WINDOW_MIN_HOURS ||
      parsedHours > ISSUE_WINDOW_MAX_HOURS
    ) {
      setSaveError(
        `The issue window is a whole number of hours between ${ISSUE_WINDOW_MIN_HOURS} and ${ISSUE_WINDOW_MAX_HOURS}.`,
      );
      return;
    }
    const parsedBands = readBands();
    if ("problem" in parsedBands) {
      setSaveError(parsedBands.problem);
      return;
    }

    setBusy(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const next = await updateSettings({
        issueWindowHours: parsedHours,
        deliveryFeeBands: parsedBands.bands,
        reason: "Updated from the portal",
      });
      setSettings(next);
      setHours(String(next.issueWindowHours));
      setBands(toDraft(next.deliveryFeeBands));
      setSaveOk(
        "Saved. New orders price delivery from these bands, and issue windows opened from now use the new length. Orders already delivered keep the window they were given.",
      );
    } catch (err) {
      setSaveError(
        opsErrorMessage(err, "Could not save these settings. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPickPaymentQr(file: File | undefined) {
    if (!file) return;
    setQrBusy(true);
    setQrError(null);
    setQrOk(null);
    try {
      const next = await uploadPaymentQr(file);
      setSettings(next);
      setQrOk("Saved. Checkout will show this plate the next time it loads settings.");
    } catch (err) {
      setQrError(
        opsErrorMessage(
          err,
          "Could not store that QR. Use a JPEG, PNG or WebP under 5 MB and try again.",
        ),
      );
    } finally {
      setQrBusy(false);
    }
  }

  function paymentQrPreviewSrc(): string | null {
    const value = settings?.paymentQr?.imageUrl?.trim() ?? "";
    if (!value) return null;
    if (value.startsWith("/")) return `${getApiBase().replace(/\/$/, "")}${value}`;
    return value;
  }

  if (loading && !settings) return <SettingsSkeleton />;
  if (error || !settings) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const dirty =
    hours !== String(settings.issueWindowHours) ||
    JSON.stringify(bands) !== JSON.stringify(toDraft(settings.deliveryFeeBands));

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Platform-wide numbers and the GCash plate checkout scans, changed here
        rather than in a release.
      </p>

      <div className="grid w-full gap-3 lg:grid-cols-2 lg:items-start">
      <section className="gg-card p-3" aria-labelledby="window-heading">
        <h2 id="window-heading" className="text-h3 text-text-primary m-0">
          Issue window
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
          {ISSUE_WINDOW_COPY}
        </p>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="issue-hours">Hours after delivery</FieldLabel>
            <Input
              id="issue-hours"
              inputMode="numeric"
              className="max-w-40"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <FieldDescription>{HOURS_HELP}</FieldDescription>
          </Field>
        </FieldGroup>
      </section>

      <section className="gg-card p-3" aria-labelledby="bands-heading">
        <h2 id="bands-heading" className="text-h3 text-text-primary m-0">
          Delivery distance bands
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
          {BANDS_COPY}
        </p>
        <p className="text-body text-warning m-0 mt-2 max-w-prose">
          The figures below are Firstmate&rsquo;s starting suggestion, not
          prices the captain set. Replace them with the real ones.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {bands.map((band, index) => {
            const isLast = index === bands.length - 1;
            return (
              <div
                key={index}
                className="flex flex-wrap items-end gap-3 rounded-card border border-outline-subtle p-3"
              >
                <Field className="min-w-32 flex-1">
                  <FieldLabel htmlFor={`band-km-${index}`}>
                    Up to (km)
                  </FieldLabel>
                  <Input
                    id={`band-km-${index}`}
                    inputMode="decimal"
                    value={band.maxKm}
                    disabled={isLast}
                    placeholder={isLast ? "No limit" : "5"}
                    onChange={(e) =>
                      setBands((prev) =>
                        prev.map((b, i) =>
                          i === index ? { ...b, maxKm: e.target.value } : b,
                        ),
                      )
                    }
                  />
                </Field>
                <Field className="min-w-32 flex-1">
                  <FieldLabel htmlFor={`band-fee-${index}`}>Fee (₱)</FieldLabel>
                  <Input
                    id={`band-fee-${index}`}
                    inputMode="decimal"
                    value={band.feePesos}
                    onChange={(e) =>
                      setBands((prev) =>
                        prev.map((b, i) =>
                          i === index
                            ? { ...b, feePesos: e.target.value }
                            : b,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  variant="danger"
                  aria-label={`Remove band ${index + 1}`}
                  disabled={bands.length <= 1}
                  onClick={() =>
                    setBands((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            );
          })}

          <div>
            <Button
              variant="secondary"
              onClick={() =>
                setBands((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  // The open-ended band always stays last; the new one goes above it.
                  next.splice(next.length - 1, 0, {
                    maxKm: "",
                    feePesos: last?.feePesos ?? "0.00",
                  });
                  return next;
                })
              }
            >
              <Plus data-icon="inline-start" aria-hidden />
              Add a band
            </Button>
          </div>
        </div>

        <div className="mt-4 border-t border-outline-subtle pt-4">
          <h3 className="text-caption text-text-muted m-0">In force right now</h3>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {settings.deliveryFeeBands.map((band, index) => (
              <li
                key={index}
                className="text-body text-text-secondary flex flex-wrap justify-between gap-x-4"
              >
                <span>
                  {describeBand(
                    band,
                    index === 0
                      ? null
                      : settings.deliveryFeeBands[index - 1]
                          .maxDistanceMeters,
                  )}
                </span>
                <span className="text-text-primary tabular-nums">
                  {formatPhp(band.feeMinor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      </div>

      <section className="gg-card p-3" aria-labelledby="payment-qr-heading">
        <h2 id="payment-qr-heading" className="text-h3 text-text-primary m-0">
          Payment QR
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
          {QR_COPY}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="w-40 max-w-full overflow-hidden rounded-card border border-outline bg-surface-variant">
            {paymentQrPreviewSrc() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={paymentQrPreviewSrc() ?? undefined}
                alt="Current GRIDGO payment QR"
                className="block h-auto w-full"
              />
            ) : (
              <p className="text-caption text-text-muted m-0 p-3">
                No plate uploaded yet. Checkout uses the bundled GCash
                screenshot until you add one here.
              </p>
            )}
          </div>
          <FieldGroup className="min-w-0 flex-1">
            <Field>
              <FieldLabel htmlFor="payment-qr-file">Replace the plate</FieldLabel>
              <input
                id="payment-qr-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={qrBusy}
                className="text-caption text-text-secondary file:mr-3 file:rounded-field file:border file:border-outline file:bg-surface file:px-3 file:py-1.5 file:text-caption file:text-text-primary"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onPickPaymentQr(file);
                }}
              />
              <FieldDescription>
                JPEG, PNG or WebP, up to 5 MB. A phone screenshot of the GCash
                InstaPay plate is the right shape — do not square-crop it.
              </FieldDescription>
            </Field>
            {qrBusy ? (
              <p className="text-body text-text-secondary m-0" role="status">
                Uploading…
              </p>
            ) : null}
            {qrOk ? (
              <p className="text-body text-success m-0" role="status">
                {qrOk}
              </p>
            ) : null}
            {qrError ? (
              <p className="text-body text-error m-0" role="alert">
                {qrError}
              </p>
            ) : null}
          </FieldGroup>
        </div>
      </section>

      {saveOk ? (
        <p className="text-body text-success m-0" role="status">
          {saveOk}
        </p>
      ) : null}
      {saveError ? (
        <p className="text-body text-error m-0" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !dirty}
          onClick={() => {
            setHours(String(settings.issueWindowHours));
            setBands(toDraft(settings.deliveryFeeBands));
            setSaveError(null);
            setSaveOk(null);
          }}
        >
          Discard changes
        </Button>
      </div>
    </div>
  );
}

/**
 * The settings page while the stored values are on their way: every heading,
 * description, and field label is already correct, and only the figures the
 * API owns are reserved.
 */
function SettingsSkeleton() {
  return (
    <div
      className="flex w-full flex-col gap-3"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading platform settings</span>
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Platform-wide numbers and the GCash plate checkout scans, changed here
        rather than in a release.
      </p>

      <div className="grid w-full gap-3 lg:grid-cols-2 lg:items-start">
        <section className="gg-card p-3">
          <h2 className="text-h3 text-text-primary m-0">Issue window</h2>
          <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
            {ISSUE_WINDOW_COPY}
          </p>
          <p className="text-caption text-text-secondary m-0 mb-1">
            Hours after delivery
          </p>
          <Skeleton className="h-11 max-w-40 rounded-field" aria-hidden />
          <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">
            {HOURS_HELP}
          </p>
        </section>

        <section className="gg-card p-3">
          <h2 className="text-h3 text-text-primary m-0">
            Delivery distance bands
          </h2>
          <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
            {BANDS_COPY}
          </p>
          <div className="mt-4 flex flex-col gap-3" aria-hidden>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex flex-wrap items-end gap-3 rounded-card border border-outline-subtle p-3"
              >
                <div className="min-w-32 flex-1">
                  <p className="text-caption text-text-secondary m-0 mb-1">
                    Up to (km)
                  </p>
                  <Skeleton className="h-11 w-full rounded-field" />
                </div>
                <div className="min-w-32 flex-1">
                  <p className="text-caption text-text-secondary m-0 mb-1">
                    Fee (₱)
                  </p>
                  <Skeleton className="h-11 w-full rounded-field" />
                </div>
                <Skeleton className="h-11 w-11 rounded-field" />
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-outline-subtle pt-4">
            <h3 className="text-caption text-text-muted m-0">
              In force right now
            </h3>
            <SkeletonLines lines={3} className="mt-2" />
          </div>
        </section>
      </div>

      <section className="gg-card p-3">
        <h2 className="text-h3 text-text-primary m-0">Payment QR</h2>
        <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
          {QR_COPY}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Skeleton className="h-40 w-40 max-w-full rounded-card" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-caption text-text-secondary m-0 mb-1">
              Replace the plate
            </p>
            <Skeleton className="h-9 w-64 max-w-full rounded-field" aria-hidden />
          </div>
        </div>
      </section>
    </div>
  );
}
