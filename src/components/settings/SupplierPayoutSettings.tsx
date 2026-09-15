"use client";

/**
 * Where the shop gets paid, from the portal.
 *
 * The same record the supplier app edits under Account, drawn for a shop
 * that keeps its wallet screenshot on the office computer rather than the
 * counter phone. The plate leads, because the plate is what Operations
 * actually uses: a release is a person scanning it. The words under it are
 * how that person checks the scan reached the right shop.
 *
 * A picked picture goes to GRIDGO at once so the shop sees the real plate,
 * but nothing becomes the one Operations scans until Save. A save carries the
 * version the account was read at, so a change made in the app meanwhile is
 * offered rather than overwritten.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { PayoutQrPlate } from "@/components/orders/PayoutDestination";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/loading";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getMyPayoutAccount,
  isApiError,
  updateMyPayoutAccount,
  uploadPayoutQr,
} from "@/lib/api/client";
import type {
  PayoutProvider,
  SupplierPayoutAccount,
  SupplierPayoutAccountPatch,
} from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

const PROVIDERS: { value: PayoutProvider; label: string; detail: string }[] = [
  {
    value: "gcash",
    label: "GCash",
    detail: "Operations scans your GCash QR and sends to that number.",
  },
  {
    value: "maya",
    label: "Maya",
    detail: "Operations scans your Maya QR and sends to that number.",
  },
  {
    value: "bank",
    label: "Bank transfer",
    detail: "Your bank's QR, or the account number below.",
  },
  {
    value: "other",
    label: "Another wallet",
    detail: "Any other wallet with a receiving QR.",
  },
];

const PLATE_COPY =
  "The receiving QR from your wallet app, or a clear photo of the plate on your counter. Operations scans it to send each payout.";

type Draft = {
  provider: PayoutProvider | null;
  accountName: string;
  accountNumber: string;
  institution: string;
  /** A plate sent but not yet saved as the one Operations scans. */
  pendingQrFileId: string | null;
  /** A saved plate the shop asked to take down. */
  qrRemoved: boolean;
};

function draftFrom(account: SupplierPayoutAccount | null): Draft {
  return {
    provider: (account?.provider as PayoutProvider | undefined) ?? null,
    accountName: account?.accountName ?? "",
    accountNumber: account?.accountNumber ?? "",
    institution: account?.institution ?? "",
    pendingQrFileId: null,
    qrRemoved: false,
  };
}

/** Only what moved, so a save never sends a name the shop never touched. */
export function payoutPatchFrom(
  account: SupplierPayoutAccount | null,
  draft: Draft,
): SupplierPayoutAccountPatch {
  const patch: SupplierPayoutAccountPatch = {};
  const accountName = draft.accountName.trim();
  const accountNumber = draft.accountNumber.trim();
  const institution = draft.institution.trim();
  if (draft.provider && draft.provider !== account?.provider)
    patch.provider = draft.provider;
  if (accountName !== (account?.accountName ?? "")) patch.accountName = accountName;
  if (accountNumber !== (account?.accountNumber ?? ""))
    patch.accountNumber = accountNumber;
  if (institution !== (account?.institution ?? "")) patch.institution = institution;
  if (draft.qrRemoved && account?.qr) patch.qrFileId = null;
  else if (draft.pendingQrFileId) patch.qrFileId = draft.pendingQrFileId;
  return patch;
}

function isWallet(provider: PayoutProvider | null): boolean {
  return provider === "gcash" || provider === "maya";
}

function payoutErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    if (err.status === 404 || err.status === 405) {
      return "GRIDGO has not opened payout accounts on this portal yet. Check again shortly.";
    }
    switch (err.code) {
      case "payout_account_stale":
      case "expected_version_required":
        return "Your payout account changed somewhere else. The latest has been loaded; make your change again.";
      case "invalid_payout_qr":
      case "file_already_attached":
        return "That picture could not be used as your QR. Choose it again and save.";
      case "invalid_payout_account": {
        const field = err.detail("field");
        if (field === "accountNumber") {
          return "For GCash or Maya, the number must be the Philippine mobile number the wallet is registered to.";
        }
        if (field === "provider") return "Choose GCash, Maya, a bank, or another wallet.";
        if (field === "accountName")
          return "Enter the name the wallet shows when someone pays you.";
        return `${fallback} Check the fields and try again.`;
      }
      case "purpose_media_type_not_allowed":
      case "file_type_mismatch":
      case "heic_not_supported":
        return "Use a JPEG, PNG or WebP of the QR. iPhone HEIC screenshots need converting first.";
      case "file_too_large":
        return "That picture is over 5 MB. A plain screenshot of the plate is enough.";
      default:
        if (err.kind === "forbidden")
          return "Only a supplier account can set where it gets paid.";
        if (err.kind === "unauthorized") return "Your session expired. Sign in again.";
        return `${fallback} (${err.code.replace(/_/g, " ")}).`;
    }
  }
  return fallback;
}

export function SupplierPayoutSettings() {
  const [account, setAccount] = useState<SupplierPayoutAccount | null>(null);
  const [draft, setDraft] = useState<Draft>(draftFrom(null));
  const [loaded, setLoaded] = useState(false);
  // The first read seeds the form; later live reads must not swallow typing.
  const seeded = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Partial<Record<keyof Draft, string>>>({});

  const load = useSerializedLoad(
    useCallback(async (adoptDraft = false) => {
      setError(null);
      try {
        const next = await getMyPayoutAccount();
        setAccount(next);
        const adopt = adoptDraft || !seeded.current;
        seeded.current = true;
        setDraft((current) => (adopt ? draftFrom(next) : current));
        setLoaded(true);
      } catch (err) {
        setError(payoutErrorMessage(err, "Could not load where you get paid."));
      }
    }, []),
  );

  useLiveReload(["identity"], load);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setSaveOk(null);
    setProblems({});
  }

  async function onPickQr(file: File | undefined) {
    if (!file) return;
    setQrBusy(true);
    setQrError(null);
    setSaveOk(null);
    try {
      const stored = await uploadPayoutQr(file);
      edit({ pendingQrFileId: stored.fileId, qrRemoved: false });
    } catch (err) {
      setQrError(payoutErrorMessage(err, "Could not store that picture."));
    } finally {
      setQrBusy(false);
    }
  }

  function validate(): boolean {
    const next: Partial<Record<keyof Draft, string>> = {};
    if (!draft.provider) next.provider = "Choose where you want to be paid.";
    if (!draft.accountName.trim()) {
      next.accountName = "Enter the name the wallet shows when someone pays you.";
    }
    const number = draft.accountNumber.trim();
    if (
      number &&
      isWallet(draft.provider) &&
      !/^(\+?63|0)9\d{9}$/.test(number.replace(/[\s()-]/g, ""))
    ) {
      next.accountNumber =
        "Enter the mobile number this wallet is registered to, like 0917 123 4567.";
    }
    if (draft.provider === "bank" && !draft.institution.trim()) {
      next.institution = "Name the bank so Operations picks the right one.";
    }
    setProblems(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) return;
    const patch = payoutPatchFrom(account, draft);
    if (!Object.keys(patch).length) return;
    setBusy(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const next = await updateMyPayoutAccount(account?.version ?? null, patch);
      setAccount(next);
      setDraft(draftFrom(next));
      setSaveOk(
        next.qr
          ? "Saved. Operations will scan this QR the next time it releases a payout to you."
          : "Saved. Operations will send to this name and number until you add a QR.",
      );
    } catch (err) {
      setSaveError(payoutErrorMessage(err, "Could not save where you get paid."));
      if (
        isApiError(err) &&
        (err.code === "payout_account_stale" || err.code === "expected_version_required")
      ) {
        await load(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!loaded && !error) return <SkeletonLines lines={6} />;
  if (error && !loaded) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load(true)}>
            Retry
          </Button>
        }
      />
    );
  }

  const plateFileId = draft.qrRemoved
    ? null
    : (draft.pendingQrFileId ?? account?.qr?.fileId ?? null);
  const dirty = Object.keys(payoutPatchFrom(account, draft)).length > 0;
  const wallet = isWallet(draft.provider);

  return (
    <div className="flex flex-col gap-4">
      <section className="gg-card p-3" aria-labelledby="payout-qr-heading">
        <h2 id="payout-qr-heading" className="text-h3 text-text-primary m-0">
          Your payout QR
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
          {PLATE_COPY}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="w-56 max-w-full shrink-0">
            <PayoutQrPlate
              fileId={plateFileId}
              shopName="Your"
              enlarge={Boolean(plateFileId)}
            />
          </div>
          <FieldGroup className="min-w-0 flex-1">
            <Field>
              <FieldLabel htmlFor="payout-qr-file">
                {plateFileId ? "Replace the QR" : "Add your QR"}
              </FieldLabel>
              <input
                id="payout-qr-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={qrBusy || busy}
                className="text-caption text-text-secondary file:mr-3 file:rounded-field file:border file:border-outline file:bg-surface file:px-3 file:py-1.5 file:text-caption file:text-text-primary"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onPickQr(file);
                }}
              />
              <FieldDescription>
                JPEG, PNG or WebP, up to 5 MB. A screenshot of the wallet&apos;s receiving
                QR is the right picture.
              </FieldDescription>
            </Field>
            {plateFileId ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={qrBusy || busy}
                onClick={() => edit({ pendingQrFileId: null, qrRemoved: true })}
              >
                Take down the QR
              </Button>
            ) : null}
            {qrBusy ? (
              <p className="text-body text-text-secondary m-0" role="status">
                Sending the picture…
              </p>
            ) : null}
            {draft.pendingQrFileId ? (
              <p className="text-body text-text-secondary m-0" role="status">
                Sent to GRIDGO. Save below to make it the one Operations scans.
              </p>
            ) : null}
            {draft.qrRemoved && account?.qr ? (
              <p className="text-body text-text-secondary m-0" role="status">
                Save below to take it down. Operations will use the name and number
                instead.
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

      <section className="gg-card p-3" aria-labelledby="payout-words-heading">
        <h2 id="payout-words-heading" className="text-h3 text-text-primary m-0">
          Wallet and name
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
          How Operations checks the scan reached you, and what they use if the QR will not
          read.
        </p>
        <FieldGroup>
          <Field>
            <FieldLabel id="payout-provider-label">Paid through</FieldLabel>
            <RadioGroup
              aria-labelledby="payout-provider-label"
              value={draft.provider ?? ""}
              onValueChange={(value) => edit({ provider: value as PayoutProvider })}
              className="gap-2"
            >
              {PROVIDERS.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline bg-surface px-3 py-2 has-[[data-checked]]:border-accent"
                >
                  <RadioGroupItem
                    value={option.value}
                    className="mt-1"
                    aria-label={option.label}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-text-primary">
                      {option.label}
                    </span>
                    <span className="block text-caption text-text-muted">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {problems.provider ? (
              <p className="text-caption text-error m-0" role="alert">
                {problems.provider}
              </p>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="payout-account-name">Account name</FieldLabel>
            <Input
              id="payout-account-name"
              value={draft.accountName}
              autoComplete="name"
              placeholder="Ben S."
              disabled={busy}
              aria-invalid={Boolean(problems.accountName)}
              onChange={(event) => edit({ accountName: event.target.value })}
            />
            <FieldDescription>
              {problems.accountName ? (
                <span className="text-error">{problems.accountName}</span>
              ) : (
                "The name the wallet shows Operations after the scan, so they know it is you."
              )}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="payout-account-number">
              {wallet ? "Wallet mobile number" : "Account number"}
            </FieldLabel>
            <Input
              id="payout-account-number"
              value={draft.accountNumber}
              inputMode={wallet ? "tel" : "text"}
              placeholder={wallet ? "0917 123 4567" : "1234 5678 90"}
              disabled={busy}
              aria-invalid={Boolean(problems.accountNumber)}
              onChange={(event) => edit({ accountNumber: event.target.value })}
            />
            <FieldDescription>
              {problems.accountNumber ? (
                <span className="text-error">{problems.accountNumber}</span>
              ) : wallet ? (
                "The number the wallet is registered to. Optional when your QR reads well."
              ) : (
                "What Operations types if the QR will not read. Optional."
              )}
            </FieldDescription>
          </Field>

          {draft.provider === "bank" || draft.provider === "other" ? (
            <Field>
              <FieldLabel htmlFor="payout-institution">
                {draft.provider === "bank" ? "Bank" : "Wallet"}
              </FieldLabel>
              <Input
                id="payout-institution"
                value={draft.institution}
                placeholder={draft.provider === "bank" ? "BPI" : "ShopeePay"}
                disabled={busy}
                aria-invalid={Boolean(problems.institution)}
                onChange={(event) => edit({ institution: event.target.value })}
              />
              <FieldDescription>
                {problems.institution ? (
                  <span className="text-error">{problems.institution}</span>
                ) : draft.provider === "bank" ? (
                  "As it appears on your account, like BPI or BDO."
                ) : (
                  "The wallet's name, so Operations opens the right app."
                )}
              </FieldDescription>
            </Field>
          ) : null}
        </FieldGroup>
      </section>

      {error && loaded ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
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
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={busy || qrBusy || !dirty}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : account ? "Save changes" : "Save where you get paid"}
        </Button>
        {!dirty && account ? (
          <p className="text-caption text-text-muted m-0">
            This is where GRIDGO sends your payouts. Change something to save it.
          </p>
        ) : null}
      </div>
    </div>
  );
}
