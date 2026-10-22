"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  getMyShopHours,
  getSupplierProfile,
  updateSupplierProfile,
  type SupplierProfile,
} from "@/lib/api/client";
import type { ShopHours } from "@/lib/api/types";
import { timeLabel } from "@/lib/shop-hours";
import {
  CLOSING_DOES_NOT_CANCEL,
  draftFromProfile,
  shopDetailPatch,
  shopDetailProblems,
  SHOP_DETAILS_NOT_OPEN_YET,
  SHOP_DETAILS_STALE,
  type ShopDetailDraft,
} from "@/lib/supplier-profile";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function hoursLine(hours: ShopHours | null): string {
  if (!hours) return "Shop hours are not available yet.";
  if (hours.temporarilyClosed) return "Temporarily closed.";
  if (hours.week.length === 0) return "No open days yet.";
  const first = hours.week[0];
  const day = WEEKDAYS[first.weekday] ?? "Open day";
  return `${hours.isOpenNow ? "Open now" : "Closed now"}. ${day} ${timeLabel(first.opensMinute)}–${timeLabel(first.closesMinute)}.`;
}

export default function SupplierShopPage() {
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [draft, setDraft] = useState<ShopDetailDraft | null>(null);
  const [hours, setHours] = useState<ShopHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const load = useCallback(async (adopt: boolean) => {
    setError(null);
    try {
      const [next, nextHours] = await Promise.all([
        getSupplierProfile(),
        getMyShopHours().catch(() => null),
      ]);
      setHours(nextHours);
      setProfile((current) => {
        const currentDraft = draftRef.current;
        const dirty =
          current &&
          currentDraft &&
          Object.keys(shopDetailPatch(current, currentDraft)).length > 0;
        if (!adopt && dirty && current.version !== next.version) {
          setConflict(SHOP_DETAILS_STALE);
          return current;
        }
        setDraft(draftFromProfile(next));
        setConflict(null);
        return next;
      });
      setUnavailable(false);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        setUnavailable(true);
      } else {
        setError("Could not load shop details. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  function setField<K extends keyof ShopDetailDraft>(key: K, value: ShopDetailDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setSavedNote(null);
  }

  async function save() {
    if (!profile || !draft) return;
    const problems = shopDetailProblems(draft);
    const first = Object.values(problems)[0];
    if (first) {
      setError(first);
      return;
    }
    const patch = shopDetailPatch(profile, draft);
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updateSupplierProfile(profile.version, patch);
      setProfile(next);
      setDraft(draftFromProfile(next));
      setConflict(null);
      setSavedNote("Saved. The shop app shows this after a refresh.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(SHOP_DETAILS_STALE);
      } else if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        setUnavailable(true);
      } else {
        setError(
          err instanceof ApiError
            ? "GRIDGO did not accept that change."
            : "Could not save.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading && !profile) return <Skeleton className="h-40 w-full" />;
  if (unavailable)
    return <EmptyState title="Shop details" body={SHOP_DETAILS_NOT_OPEN_YET} />;
  if (!profile || !draft) {
    return (
      <ErrorState
        body={error ?? "Could not load shop details."}
        action={<Button onClick={() => void load(true)}>Retry</Button>}
      />
    );
  }

  const problems = shopDetailProblems(draft);
  const dirty = Object.keys(shopDetailPatch(profile, draft)).length > 0;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-h2 text-text-primary m-0">Shop details</h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Name, contact, phone, and printing location. Email, password, and portrait stay
          on the account that Manage account opens.
        </p>
      </header>

      {conflict ? (
        <div
          className="border-outline flex flex-col gap-2 rounded-field border p-3"
          role="status"
        >
          <p className="text-body text-text-primary m-0">{conflict}</p>
          <Button variant="secondary" onClick={() => void load(true)}>
            Load the latest
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      {savedNote ? (
        <p className="text-body text-text-secondary m-0">{savedNote}</p>
      ) : null}

      {/* Fields lock while a save is in flight, as on the shop app: the answer
          replaces the draft, so an edit typed meanwhile would be lost. */}
      <form
        aria-busy={saving}
        className="gg-card flex flex-col gap-3 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Shop name" problem={problems.shopName}>
          <Input
            value={draft.shopName}
            disabled={saving}
            onChange={(event) => setField("shopName", event.target.value)}
          />
        </Field>
        <Field label="Contact" problem={problems.contactName}>
          <Input
            value={draft.contactName}
            disabled={saving}
            onChange={(event) => setField("contactName", event.target.value)}
          />
        </Field>
        <Field label="Phone" problem={problems.phone}>
          <Input
            value={draft.phone}
            inputMode="tel"
            disabled={saving}
            onChange={(event) => setField("phone", event.target.value)}
          />
        </Field>
        <p className="text-caption text-text-muted m-0">
          Email {profile.email || "is on your sign-in account"}. Change it from Manage
          account.
        </p>
        <h3 className="text-h3 text-text-primary m-0 mt-2">Printing location</h3>
        <Field label="What riders should look for" problem={problems.pinLabel}>
          <Input
            value={draft.pinLabel}
            disabled={saving}
            onChange={(event) => setField("pinLabel", event.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Latitude" problem={problems.lat}>
            <Input
              value={draft.lat}
              inputMode="decimal"
              disabled={saving}
              onChange={(event) => setField("lat", event.target.value)}
            />
          </Field>
          <Field label="Longitude" problem={problems.lng}>
            <Input
              value={draft.lng}
              inputMode="decimal"
              disabled={saving}
              onChange={(event) => setField("lng", event.target.value)}
            />
          </Field>
        </div>
        <p className="text-caption text-text-muted m-0">
          GRIDGO measures delivery from this pin. Jobs already priced keep the pin they
          were priced with.
        </p>
        <Button type="submit" disabled={!dirty || saving || Boolean(conflict)}>
          {saving ? "Saving…" : "Save shop details"}
        </Button>
      </form>

      <section className="gg-card flex flex-col gap-2 p-3">
        <h3 className="text-h3 text-text-primary m-0">Hours</h3>
        <p className="text-body text-text-secondary m-0">{hoursLine(hours)}</p>
        <p className="text-body text-text-secondary m-0">{CLOSING_DOES_NOT_CANCEL}</p>
        <Link
          href="/supplier/shop-hours"
          className="text-body text-text-primary underline"
        >
          Edit shop hours
        </Link>
      </section>

      <section className="gg-card flex flex-col gap-2 p-3" aria-label="Help">
        <h3 className="text-h3 text-text-primary m-0">Help</h3>
        <Link href="/supplier/legal" className="text-body text-text-primary underline">
          Legal & privacy
        </Link>
        <Link href="/supplier/privacy" className="text-body text-text-primary underline">
          Your data
        </Link>
        <Link href="/supplier/report" className="text-body text-text-primary underline">
          Report a problem
        </Link>
      </section>
    </div>
  );
}

function Field({
  label,
  problem,
  children,
}: {
  label: string;
  problem?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-text-muted">{label}</span>
      {children}
      {problem ? <span className="text-caption text-error">{problem}</span> : null}
    </label>
  );
}
