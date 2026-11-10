"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  ImagePlus,
  Loader2,
  PanelBottomOpen,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { PromoPreview, type PreviewPromo } from "@/components/home-promos/PromoPreview";
import { PromoStats } from "@/components/home-promos/PromoStats";
import { useFileUrls } from "@/components/home-promos/useFileUrls";
import { usePromoClock } from "@/components/home-promos/usePromoClock";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createHomePromo,
  getHomePromo,
  listHomePromos,
  removeHomePromo,
  updateHomePromo,
  uploadHomePromoFile,
  type HomePromo,
  type HomePromoFile,
  type HomePromoFilePurpose,
  type HomePromoStyle,
  type HomePromoTapAction,
} from "@/lib/api/home-promos";
import {
  HOME_PROMO_LIMITS,
  TAG_CHOICES,
  TAG_LABEL,
  TAP_COPY,
  draftFromHomePromo,
  draftStatus,
  emptyHomePromoDraft,
  homePromoErrorText,
  inputFromHomePromoDraft,
  nextDisplayOrder,
  presentHomePromoStatus,
  patchFromDraft,
  rotationOrder,
  statusAt,
  validateHomePromoDraft,
  type HomePromoDraft,
  type HomePromoErrors,
} from "@/lib/home-promos";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { uploadErrorMessage } from "@/lib/upload-errors";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = "image/png,image/jpeg,image/webp";

type Props = { tree: "ops" | "admin"; promoId: string | "new" };

/**
 * Add or edit one Home promo, beside a phone-size preview of the client's
 * Home tile (rotating with Reorder and the other live promos) and its sheet.
 * Editing an existing promo also shows its numbers by day and Remove.
 */
export function HomePromoEditor({ tree, promoId }: Props) {
  const isNew = promoId === "new";
  const [promo, setPromo] = useState<HomePromo | null>(null);
  const [others, setOthers] = useState<HomePromo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const [list, one] = await Promise.all([
        listHomePromos(),
        isNew ? Promise.resolve(null) : getHomePromo(promoId),
      ]);
      setOthers(list.filter((p) => p.id !== promoId));
      setPromo(one);
      setError(null);
      loadedOnce.current = true;
    } catch (err) {
      // A background re-read that fails keeps the page as it is.
      if (!loadedOnce.current) setError(homePromoErrorText(err, "Could not load this promo."));
    }
  }, [isNew, promoId]);
  const refresh = useSerializedLoad(load);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useLiveReload("notifications", refresh);

  if (error) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void refresh()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (!others || (!isNew && !promo)) {
    return <SkeletonCards count={3} lines={3} label="Loading the promo" />;
  }
  return (
    <EditorBody
      key={promo ? promo.id : "new"}
      tree={tree}
      promo={promo}
      others={others}
      onSaved={setPromo}
      onReturn={refresh}
    />
  );
}

/** A draft as compared for "changed": media by file id, not by link. */
function plain(d: HomePromoDraft): string {
  return JSON.stringify({ ...d, logo: d.logo?.fileId ?? null, image: d.image?.fileId ?? null });
}

function EditorBody({
  tree,
  promo,
  others,
  onSaved,
  onReturn,
}: {
  tree: "ops" | "admin";
  promo: HomePromo | null;
  others: HomePromo[];
  onSaved: (promo: HomePromo) => void;
  onReturn: () => void;
}) {
  const router = useRouter();
  const listHref = `/${tree}/home-promos`;
  /**
   * The values this edit started from. Save sends only what differs from
   * it, so a field another tab changed meanwhile is never written back.
   */
  const [origin, setOrigin] = useState<HomePromoDraft | null>(() => (promo ? draftFromHomePromo(promo) : null));
  const [draft, setDraft] = useState<HomePromoDraft>(() =>
    promo ? draftFromHomePromo(promo) : emptyHomePromoDraft(Date.now(), nextDisplayOrder(others)),
  );
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uploading, setUploading] = useState<HomePromoFilePurpose | null>(null);
  const [uploadError, setUploadError] = useState<Partial<Record<HomePromoFilePurpose, string>>>({});
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const errors: HomePromoErrors = attempted ? validateHomePromoDraft(draft) : {};
  const dirty = !origin || plain(origin) !== plain(draft);
  const latest = useMemo(() => (promo ? draftFromHomePromo(promo) : null), [promo]);
  const changedElsewhere = !!origin && !!latest && plain(origin) !== plain(latest);

  // A fresh read with no edit open takes the new values; an open edit is kept.
  useEffect(() => {
    if (!latest || dirty) return;
    if (origin && plain(origin) === plain(latest)) return;
    setOrigin(latest);
    setDraft(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);

  const now = usePromoClock(promo ? [promo, ...others] : others, onReturn);

  function set<K extends keyof HomePromoDraft>(key: K, value: HomePromoDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSavedAt(null);
  }

  async function pick(purpose: HomePromoFilePurpose, file: File | undefined) {
    if (!file) return;
    setUploading(purpose);
    setUploadError((e) => ({ ...e, [purpose]: undefined }));
    try {
      const stored = await uploadHomePromoFile(purpose, file);
      const local = URL.createObjectURL(file);
      objectUrls.current.push(local);
      const ref: HomePromoFile = { fileId: stored.fileId, url: local };
      set(purpose === "promotion_logo" ? "logo" : "image", ref);
    } catch (err) {
      setUploadError((e) => ({
        ...e,
        [purpose]: uploadErrorMessage(err, { what: purpose === "promotion_logo" ? "this logo" : "this image" }),
      }));
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setAttempted(true);
    if (Object.keys(validateHomePromoDraft(draft)).length) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (!promo || !origin) {
        const created = await createHomePromo(inputFromHomePromoDraft(draft));
        router.replace(`${listHref}/${encodeURIComponent(created.id)}?created=1`);
        return;
      }
      const saved = await updateHomePromo(promo.id, patchFromDraft(origin, draft));
      // The saved promo is the truth now, including anything changed elsewhere.
      const next = draftFromHomePromo(saved);
      setOrigin(next);
      setDraft(next);
      setSavedAt(Date.now());
      onSaved(saved);
    } catch (err) {
      setSaveError(homePromoErrorText(err, "Could not save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!promo) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeHomePromo(promo.id);
      router.replace(`${listHref}?removed=${encodeURIComponent(promo.name)}`);
    } catch (err) {
      setRemoveError(homePromoErrorText(err, "Could not remove. Try again."));
      setRemoving(false);
    }
  }

  // Preview: the other live promos plus this draft at its display order.
  const urls = useFileUrls([draft.logo, draft.image, ...others.flatMap((p) => [p.logo, p.image])]);
  const draftKey = promo?.id ?? "draft";
  const status = draftStatus(draft, now);
  const previews = useMemo(() => {
    const toPreview = (p: HomePromo): PreviewPromo & { order: number } => ({
      key: p.id,
      name: p.name,
      logoUrl: p.logo ? urls[p.logo.fileId] ?? null : null,
      imageUrl: p.image ? urls[p.image.fileId] ?? null : null,
      description: p.description,
      tag: p.tag,
      linkText: p.linkText,
      linkUrl: p.linkUrl,
      tapAction: p.tapAction,
      style: p.style,
      order: p.displayOrder,
    });
    const mine: PreviewPromo & { order: number } = {
      key: draftKey,
      name: draft.name.trim(),
      logoUrl: draft.logo ? urls[draft.logo.fileId] ?? null : null,
      imageUrl: draft.image ? urls[draft.image.fileId] ?? null : null,
      description: draft.description.trim(),
      tag: draft.tag,
      linkText: draft.linkText.trim(),
      linkUrl: draft.linkUrl.trim(),
      tapAction: draft.tapAction,
      style: draft.style,
      order: Number(draft.displayOrder) || 0,
    };
    // The draft is always shown, live or not, so its look can be checked.
    return [...rotationOrder(others, now).map(toPreview), mine].sort((a, b) => a.order - b.order);
  }, [others, draft, urls, draftKey, now]);

  const presented = presentHomePromoStatus(promo && !dirty ? statusAt(promo, now) : status);
  const descriptionLeft = HOME_PROMO_LIMITS.description - draft.description.trim().length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" nativeButton={false} render={<Link href={listHref} />}>
          <ArrowLeft aria-hidden data-icon="inline-start" />
          Home promos
        </Button>
        <span className="flex-1" />
        <StatusChip tone={presented.tone} label={presented.label} icon={presented.icon} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <form
          className="flex min-w-0 flex-col gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FieldGroup>
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor="promo-name">Business name</FieldLabel>
              <Input
                id="promo-name"
                value={draft.name}
                maxLength={HOME_PROMO_LIMITS.name}
                onChange={(e) => set("name", e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                autoComplete="off"
              />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <FilePicker
                id="promo-logo"
                label="Logo"
                hint="Square. PNG, JPEG or WebP, up to 5 MB."
                file={draft.logo}
                url={draft.logo ? urls[draft.logo.fileId] ?? null : null}
                round
                busy={uploading === "promotion_logo"}
                error={uploadError.promotion_logo ?? errors.logo}
                onPick={(f) => void pick("promotion_logo", f)}
              />
              <FilePicker
                id="promo-image"
                label="Card image"
                hint="Optional, fills the card. PNG, JPEG or WebP, up to 15 MB."
                file={draft.image}
                url={draft.image ? urls[draft.image.fileId] ?? null : null}
                busy={uploading === "promotion_image"}
                error={uploadError.promotion_image}
                onPick={(f) => void pick("promotion_image", f)}
                onClear={() => set("image", null)}
              />
            </div>

            <Field data-invalid={errors.description ? true : undefined}>
              <FieldLabel htmlFor="promo-description">Description</FieldLabel>
              <Textarea
                id="promo-description"
                rows={2}
                value={draft.description}
                maxLength={HOME_PROMO_LIMITS.description}
                onChange={(e) => set("description", e.target.value)}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby="promo-description-count"
              />
              <FieldDescription id="promo-description-count">
                <span className={descriptionLeft < 20 ? "text-warning" : undefined}>{descriptionLeft}</span> characters left. Shown in the sheet; optional.
              </FieldDescription>
              {errors.description ? <FieldError>{errors.description}</FieldError> : null}
            </Field>

            <Choice label="Tag">
              {TAG_CHOICES.map((tag) => (
                <Pill key={tag} name="promo-tag" checked={draft.tag === tag} onSelect={() => set("tag", tag)}>
                  {TAG_LABEL[tag]}
                </Pill>
              ))}
            </Choice>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Field data-invalid={errors.linkText ? true : undefined}>
                <FieldLabel htmlFor="promo-link-text">Button words</FieldLabel>
                <Input
                  id="promo-link-text"
                  value={draft.linkText}
                  placeholder={draft.name.trim() ? `Visit ${draft.name.trim()}` : "Visit"}
                  maxLength={HOME_PROMO_LIMITS.linkText}
                  onChange={(e) => set("linkText", e.target.value)}
                  aria-invalid={errors.linkText ? true : undefined}
                />
                {errors.linkText ? <FieldError>{errors.linkText}</FieldError> : null}
              </Field>
              <Field data-invalid={errors.linkUrl ? true : undefined}>
                <FieldLabel htmlFor="promo-link-url">Link</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="promo-link-url"
                    type="url"
                    inputMode="url"
                    value={draft.linkUrl}
                    onChange={(e) => set("linkUrl", e.target.value)}
                    aria-invalid={errors.linkUrl ? true : undefined}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Open the link in a new tab"
                    nativeButton={false}
                    render={<a href={draft.linkUrl.trim()} target="_blank" rel="noopener noreferrer" />}
                    disabled={!/^https:\/\/[^/\s]+\.[^/\s]+/i.test(draft.linkUrl.trim())}
                  >
                    <ExternalLink aria-hidden />
                  </Button>
                </div>
                {errors.linkUrl ? <FieldError>{errors.linkUrl}</FieldError> : null}
              </Field>
            </div>

            <Choice label="On tap">
              {(["sheet", "link"] as HomePromoTapAction[]).map((action) => (
                <Pill
                  key={action}
                  name="promo-tap"
                  checked={draft.tapAction === action}
                  onSelect={() => set("tapAction", action)}
                  icon={action === "sheet" ? PanelBottomOpen : ExternalLink}
                  title={TAP_COPY[action].body}
                >
                  {TAP_COPY[action].label}
                </Pill>
              ))}
            </Choice>

            <Choice label="Card style">
              {(["light", "yellow"] as HomePromoStyle[]).map((style) => (
                <Pill key={style} name="promo-style" checked={draft.style === style} onSelect={() => set("style", style)}>
                  <span
                    aria-hidden
                    className={cn(
                      "inline-block size-4 rounded-[5px] border",
                      style === "yellow"
                        ? "border-transparent bg-[var(--color-action-yellow)]"
                        : "border-outline bg-surface-variant",
                    )}
                  />
                  {style === "yellow" ? "Yellow" : "Light"}
                </Pill>
              ))}
            </Choice>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={errors.startsAt ? true : undefined}>
                <FieldLabel htmlFor="promo-starts">Starts</FieldLabel>
                <Input
                  id="promo-starts"
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(e) => set("startsAt", e.target.value)}
                  aria-invalid={errors.startsAt ? true : undefined}
                />
                {errors.startsAt ? <FieldError>{errors.startsAt}</FieldError> : null}
              </Field>
              <Field data-invalid={errors.endsAt ? true : undefined}>
                <FieldLabel htmlFor="promo-ends">Ends</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="promo-ends"
                    type="datetime-local"
                    value={draft.endsAt}
                    min={draft.startsAt || undefined}
                    onChange={(e) => set("endsAt", e.target.value)}
                    aria-invalid={errors.endsAt ? true : undefined}
                  />
                  {draft.endsAt ? (
                    <Button variant="ghost" size="icon" aria-label="No end date" onClick={() => set("endsAt", "")}>
                      <X aria-hidden />
                    </Button>
                  ) : null}
                </div>
                <FieldDescription>{draft.endsAt ? "Philippine time." : "No end date. Philippine time."}</FieldDescription>
                {errors.endsAt ? <FieldError>{errors.endsAt}</FieldError> : null}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={errors.displayOrder ? true : undefined}>
                <FieldLabel htmlFor="promo-order">Order</FieldLabel>
                <Input
                  id="promo-order"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={HOME_PROMO_LIMITS.displayOrderMax}
                  value={draft.displayOrder}
                  onChange={(e) => set("displayOrder", e.target.value)}
                  aria-invalid={errors.displayOrder ? true : undefined}
                  className="w-28"
                />
                <FieldDescription>Lowest shows first after Reorder.</FieldDescription>
                {errors.displayOrder ? <FieldError>{errors.displayOrder}</FieldError> : null}
              </Field>
              <Field orientation="horizontal" className="items-center self-start sm:pt-7">
                <Switch
                  id="promo-enabled"
                  checked={draft.enabled}
                  onCheckedChange={(checked) => set("enabled", checked)}
                />
                <FieldLabel htmlFor="promo-enabled">{draft.enabled ? "On" : "Off"}</FieldLabel>
              </Field>
            </div>
          </FieldGroup>

          {changedElsewhere && dirty ? (
            <Alert>
              <AlertDescription>
                Someone changed this promo since you opened it. Save sends only the fields you changed.
              </AlertDescription>
            </Alert>
          ) : null}
          {saveError ? (
            <Alert variant="destructive">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={saving || uploading !== null || (!!promo && !dirty)}>
              {saving ? <Loader2 className="animate-spin" aria-hidden data-icon="inline-start" /> : null}
              {promo ? "Save changes" : "Add promo"}
            </Button>
            {savedAt && !dirty ? (
              <span className="text-caption text-text-secondary" role="status">
                Saved. Clients see it next time Home opens.
              </span>
            ) : promo && dirty ? (
              <span className="text-caption text-text-muted">Unsaved changes</span>
            ) : null}
          </div>
        </form>

        <aside className="lg:sticky lg:top-3 lg:self-start" aria-label="Preview">
          <PromoPreview promos={previews} focusKey={draftKey} />
        </aside>
      </div>

      {promo ? (
        <>
          <PromoStats promo={promo} />
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-outline p-4">
            <span className="text-body text-text-secondary">Remove takes it off Home. Its numbers stay.</span>
            <Button variant="danger" onClick={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden data-icon="inline-start" />
              Remove promo
            </Button>
          </section>
          <AlertDialog open={confirmRemove} onOpenChange={(open) => !open && !removing && setConfirmRemove(false)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {promo.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  It leaves the Home card the next time a client opens Home. This cannot be undone here.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {removeError ? (
                <Alert variant="destructive">
                  <AlertDescription>{removeError}</AlertDescription>
                </Alert>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel variant="secondary" disabled={removing}>
                  Keep it
                </AlertDialogCancel>
                <AlertDialogAction variant="danger" disabled={removing} onClick={() => void remove()}>
                  {removing ? <Loader2 className="animate-spin" aria-hidden data-icon="inline-start" /> : null}
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  );
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({
  name,
  checked,
  onSelect,
  icon: Icon,
  title,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  icon?: typeof ExternalLink;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-name={name}
      title={title}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const group = e.currentTarget.parentElement;
        const items = group ? Array.from(group.querySelectorAll<HTMLButtonElement>("[role=radio]")) : [];
        const at = items.indexOf(e.currentTarget);
        const next = items[(at + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
        next?.focus();
        next?.click();
        e.preventDefault();
      }}
      tabIndex={checked ? 0 : -1}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-pill border px-4 text-body",
        checked
          ? "border-text-primary bg-surface-variant text-text-primary"
          : "border-outline bg-surface text-text-secondary hover:bg-surface-variant",
      )}
    >
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

function FilePicker({
  id,
  label,
  hint,
  file,
  url,
  round,
  busy,
  error,
  onPick,
  onClear,
}: {
  id: string;
  label: string;
  hint: string;
  file: HomePromoFile | null;
  url: string | null;
  round?: boolean;
  busy: boolean;
  error?: string;
  onPick: (file: File | undefined) => void;
  onClear?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={file ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          className={cn(
            "flex size-16 shrink-0 items-center justify-center overflow-hidden border border-dashed border-outline bg-surface-variant text-text-secondary hover:border-text-secondary",
            round ? "rounded-pill" : "rounded-card",
            file && "border-solid",
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className={cn("size-full", round ? "object-contain p-1" : "object-cover")} />
          ) : file ? (
            <ImagePlus className="size-5" aria-hidden />
          ) : (
            <Upload className="size-5" aria-hidden />
          )}
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-caption text-text-secondary">{hint}</span>
          {file && onClear ? (
            <Button variant="ghost" size="sm" className="self-start" onClick={onClear}>
              <X aria-hidden data-icon="inline-start" />
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={input}
          id={id}
          type="file"
          accept={IMAGE_TYPES}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            onPick(picked);
          }}
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
