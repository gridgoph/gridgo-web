"use client";

import { useState } from "react";
import Link from "next/link";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import {
  bpsToPercentInput,
  formatRatePercent,
  percentInputToBps,
} from "@/components/settings/service-fee";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, updateSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";

type Props = {
  settings: PlatformSettings;
  canEdit: boolean;
  onSaved: (next: PlatformSettings) => void;
  onConflict: () => Promise<void> | void;
  disabled?: boolean;
  /** Read-only: where someone who may change it does so. */
  editHref?: string;
};

const medium = { fontFamily: "var(--font-medium)" } as const;

/**
 * Substitute-shop cover (gridgo-api#225): when an order moves to a dearer
 * shop because of the shop or GRIDGO, how much of the difference GRIDGO pays
 * out of its own service fee, as a share of the order's original fee. Above
 * it the client pays the rest, picks another shop, or takes a full refund.
 *
 * Its own save through the settings version handshake, with an audit line
 * naming both values. Super Admin only; anyone else reads it.
 */
export function ShopMoveCover({
  settings,
  canEdit,
  onSaved,
  onConflict,
  disabled,
  editHref,
}: Props) {
  const stored = settings.shopMoveCoverBps;
  // Untouched, the field follows refreshed settings; typed text stays a draft.
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const text = draft ?? (stored === undefined ? "" : bpsToPercentInput(stored));
  const bps = percentInputToBps(text);
  const invalid = bps === null;
  const dirty = stored !== undefined && bps !== stored;
  const locked = busy || Boolean(disabled);

  async function save() {
    if (!canEdit || locked || !dirty || bps === null || stored === undefined) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = await updateSettings({
        expectedVersion: settings.version,
        shopMoveCoverBps: bps,
        reason: `Substitute-shop cover: ${formatRatePercent(stored)} to ${formatRatePercent(bps)} of the original service fee`,
      });
      onSaved(saved);
      setDraft(null);
      setOk(
        `Saved. GRIDGO now covers up to ${formatRatePercent(saved.shopMoveCoverBps ?? bps)} of the original service fee. Offers still open are priced again when the client accepts; moves already made keep their figures.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "settings_version_conflict") {
        setError(
          "Someone else saved settings a moment ago. Their value is now shown as in force. Check your change against it, then save again.",
        );
        await onConflict();
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only Super Admin can change the substitute-shop cover.");
      } else {
        setError(opsErrorMessage(err, "Could not save the substitute-shop cover. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gg-card p-3" aria-labelledby="shop-move-cover-heading">
      <h2 id="shop-move-cover-heading" className="text-h3 text-text-primary m-0">
        Substitute-shop cover
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        When an order moves to another shop because of the shop or GRIDGO, a cheaper shop
        refunds the difference to the client. A dearer one is covered by GRIDGO out of its
        service fee, up to this share of the order&rsquo;s original fee. Above it, the client
        pays the rest, picks another shop, or cancels for a full refund.
      </p>

      {stored === undefined ? (
        <p
          className="text-body text-text-secondary m-0 mt-3 max-w-prose"
          data-testid="shop-move-cover-unavailable"
        >
          The API behind this portal does not hold this setting yet. It appears here once it
          is updated.
        </p>
      ) : (
        <>
          <FieldGroup className="mt-4">
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="shop-move-cover">GRIDGO covers up to</FieldLabel>
              <div className="relative max-w-40">
                <Input
                  id="shop-move-cover"
                  inputMode="decimal"
                  className="pr-9"
                  value={text}
                  disabled={!canEdit || locked}
                  aria-invalid={invalid || undefined}
                  aria-describedby="shop-move-cover-help"
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setError(null);
                    setOk(null);
                  }}
                />
                <span
                  aria-hidden
                  className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center"
                >
                  %
                </span>
              </div>
              <FieldDescription id="shop-move-cover-help">
                {invalid
                  ? "0 to 100, up to two decimals."
                  : "Of the original service fee, and never more than the fee GRIDGO actually collected on the order. 0 to 100, up to two decimals."}
              </FieldDescription>
            </Field>
            <p className="text-body text-text-secondary m-0" data-testid="shop-move-cover-in-force">
              In force right now:{" "}
              <span className="text-text-primary tabular-nums" style={medium}>
                {formatRatePercent(stored)}
              </span>
              {dirty && bps !== null ? (
                <>
                  {" "}
                  &middot; after saving:{" "}
                  <span className="text-text-primary tabular-nums" style={medium}>
                    {formatRatePercent(bps)}
                  </span>
                </>
              ) : null}
            </p>
          </FieldGroup>
          <p className="text-caption text-text-muted m-0 mt-3 max-w-prose">
            A client-caused move never gets cover. Offers still open are priced again when the
            client accepts; moves already made keep their figures.
          </p>
          {canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={locked || !dirty || invalid}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save substitute-shop cover"}
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
          ) : editHref ? (
            <p className="text-caption text-text-muted m-0 mt-3">
              <Link href={editHref} className="text-text-primary underline underline-offset-2">
                Change it in Operational settings
              </Link>
            </p>
          ) : (
            <p className="text-caption text-text-muted m-0 mt-3">Only Super Admin changes this.</p>
          )}
        </>
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
