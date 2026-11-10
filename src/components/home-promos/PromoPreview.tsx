"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ExternalLink, Pause, Play, RefreshCw, Sparkles } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HomePromoStyle, HomePromoTag, HomePromoTapAction } from "@/lib/api/home-promos";
import { ROTATE_MS, TAG_LABEL } from "@/lib/home-promos";
import { cn } from "@/lib/utils";

/** What the preview draws: the form's values as the client app would. */
export type PreviewPromo = {
  key: string;
  name: string;
  logoUrl: string | null;
  imageUrl: string | null;
  description: string;
  tag: HomePromoTag;
  linkText: string;
  linkUrl: string;
  tapAction: HomePromoTapAction;
  style: HomePromoStyle;
};

type Slide = { kind: "reorder" } | { kind: "promo"; promo: PreviewPromo };

/** The client tile's height (gridgo-client `HOME_TILE_HEIGHT`), at phone scale. */
const TILE_HEIGHT = 112;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

/**
 * A phone-size copy of the client's Home with the Reorder tile rotating
 * through Reorder and the promos, every five seconds, with swipe and pager
 * dots; and the bottom sheet a tap opens. `focusKey` is the promo being
 * edited: the preview jumps to it whenever its values change.
 */
export function PromoPreview({
  promos,
  focusKey,
  className,
}: {
  promos: PreviewPromo[];
  focusKey?: string;
  className?: string;
}) {
  const slides: Slide[] = [{ kind: "reorder" }, ...promos.map((promo) => ({ kind: "promo" as const, promo }))];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [view, setView] = useState<"card" | "sheet">("card");
  const reduced = useReducedMotion();
  const focused = promos.find((p) => p.key === focusKey) ?? promos[0] ?? null;
  const focusIndex = focused ? promos.indexOf(focused) + 1 : 0;
  const signature = focused
    ? [focused.name, focused.logoUrl, focused.imageUrl, focused.description, focused.tag, focused.style, focused.linkText].join("|")
    : "";

  // Editing a field shows that promo, and holds there a moment.
  const [heldUntil, setHeldUntil] = useState(0);
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    if (focusIndex > 0) {
      setIndex(focusIndex);
      setHeldUntil(Date.now() + ROTATE_MS);
    }
  }, [signature, focusIndex]);

  const count = slides.length;
  const safeIndex = index % count;

  useEffect(() => {
    if (!playing || count < 2 || view !== "card") return;
    const timer = window.setInterval(() => {
      if (Date.now() < heldUntil) return;
      setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [playing, count, view, heldUntil]);

  // Swipe: a horizontal drag of 32px moves one slide.
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (count < 2) return;
    drag.current = { x: event.clientX, id: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    setDx(event.clientX - drag.current.x);
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    const moved = event.clientX - drag.current.x;
    drag.current = null;
    setDx(0);
    if (Math.abs(moved) < 32) {
      const slide = slides[safeIndex];
      if (slide.kind === "promo" && slide.promo.tapAction === "sheet") setView("sheet");
      return;
    }
    setIndex((i) => (moved < 0 ? (i + 1) % count : (i - 1 + count) % count));
    setHeldUntil(Date.now() + ROTATE_MS);
  }

  const current = slides[safeIndex];
  const sheetPromo = current.kind === "promo" ? current.promo : focused;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="flex w-full max-w-[320px] items-center justify-between gap-2">
        <ToggleGroup
          aria-label="Preview"
          value={[view]}
          onValueChange={(value: string[]) => {
            const next = value[0];
            if (next === "card" || next === "sheet") setView(next);
          }}
        >
          <ToggleGroupItem value="card" aria-label="Home card">
            Card
          </ToggleGroupItem>
          <ToggleGroupItem value="sheet" aria-label="Bottom sheet" disabled={!sheetPromo}>
            Sheet
          </ToggleGroupItem>
        </ToggleGroup>
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-pill border border-outline bg-surface text-text-primary disabled:opacity-40"
          onClick={() => setPlaying((p) => !p)}
          disabled={view !== "card" || count < 2}
          aria-label={playing ? "Pause rotation" : "Play rotation"}
          aria-pressed={!playing}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
      </div>

      {/* The phone: 320 wide, the client's Home drawn in its own tokens. */}
      <div
        className="relative w-[320px] max-w-full overflow-hidden rounded-[36px] border-[6px] border-text-primary bg-background"
        style={{ height: 620 }}
        role="group"
        aria-label={
          view === "sheet" && sheetPromo
            ? `Phone preview: the ${sheetPromo.name || "promo"} sheet`
            : `Phone preview: Home, showing ${current.kind === "reorder" ? "Reorder" : current.promo.name || "the promo"}, ${safeIndex + 1} of ${count}`
        }
      >
        <div className="flex h-full flex-col gap-3 px-4 pt-10 pb-6" aria-hidden>
          <MockHome />
          <div className="flex gap-3">
            <div
              className="flex min-w-0 flex-1 basis-0 flex-col justify-between rounded-card border border-outline bg-surface-variant p-3"
              style={{ height: TILE_HEIGHT }}
            >
              <span className="block size-9 rounded-pill bg-surface-high" />
              <span className="flex flex-col gap-1.5">
                <span className="block h-3 w-16 rounded-pill bg-outline" />
                <span className="block h-2.5 w-20 rounded-pill bg-outline-subtle" />
              </span>
            </div>
            <div className="flex min-w-0 flex-1 basis-0 flex-col gap-1.5">
              <div
                className="relative touch-pan-y overflow-hidden rounded-card select-none"
                style={{ height: TILE_HEIGHT }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  drag.current = null;
                  setDx(0);
                }}
                data-testid="preview-tile"
              >
                <div
                  className={cn("flex h-full", !reduced && dx === 0 && "transition-transform duration-300 ease-out")}
                  style={{ transform: `translateX(calc(${-safeIndex * 100}% + ${dx}px))` }}
                >
                  {slides.map((slide, i) => (
                    <div key={slide.kind === "reorder" ? "reorder" : slide.promo.key} className="h-full w-full shrink-0" data-active={i === safeIndex}>
                      {slide.kind === "reorder" ? <ReorderTile /> : <PromoTile promo={slide.promo} />}
                    </div>
                  ))}
                </div>
              </div>
              {count > 1 ? (
                <div className="flex justify-center gap-1" data-testid="preview-dots">
                  {slides.map((slide, i) => (
                    <span
                      key={slide.kind === "reorder" ? "reorder" : slide.promo.key}
                      className={cn(
                        "block h-1.5 rounded-pill transition-all",
                        i === safeIndex ? "w-4 bg-text-primary" : "w-1.5 bg-outline",
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <MockTabBar />
        </div>

        {view === "sheet" && sheetPromo ? <PromoSheet promo={sheetPromo} onClose={() => setView("card")} /> : null}
      </div>

      {/* Dots for people who cannot drag: each one names its slide. */}
      {count > 1 ? (
        <div className="flex flex-wrap justify-center gap-1" role="group" aria-label="Show slide">
          {slides.map((slide, i) => (
            <button
              key={slide.kind === "reorder" ? "reorder" : slide.promo.key}
              type="button"
              onClick={() => {
                setView("card");
                setIndex(i);
                setHeldUntil(Date.now() + ROTATE_MS);
              }}
              aria-current={i === safeIndex && view === "card" ? "true" : undefined}
              className={cn(
                "min-h-11 max-w-[9rem] truncate rounded-pill border px-3 text-caption",
                i === safeIndex && view === "card"
                  ? "border-text-primary text-text-primary"
                  : "border-outline text-text-secondary",
              )}
            >
              {slide.kind === "reorder" ? "Reorder" : slide.promo.name || "New promo"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MockHome() {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <span className="block h-4 w-32 rounded-pill bg-outline" />
      <span className="block h-11 w-full rounded-field border border-outline bg-surface" />
      <span className="block h-3 w-24 rounded-pill bg-outline" />
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-24 flex-1 rounded-card bg-surface-variant" />
        ))}
      </div>
      <span className="block h-3 w-28 rounded-pill bg-outline" />
      <div className="flex justify-between">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="block size-11 rounded-pill bg-surface-variant" />
        ))}
      </div>
      <span className="flex-1" />
    </div>
  );
}

function MockTabBar() {
  return (
    <div className="flex justify-around border-t border-outline pt-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="block size-6 rounded-pill bg-surface-variant" />
      ))}
    </div>
  );
}

function ReorderTile() {
  return (
    <div className="flex h-full flex-col justify-between rounded-card border border-outline bg-surface-variant p-3">
      <span className="flex size-9 items-center justify-center rounded-pill bg-surface-high">
        <RefreshCw className="size-[18px] text-text-primary" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-h3 text-text-primary">Reorder</span>
        <span className="text-caption truncate text-text-secondary">Last print</span>
      </span>
    </div>
  );
}

function Logo({ url, name, size }: { url: string | null; name: string; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-pill border border-outline bg-surface-high"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-contain p-0.5" />
      ) : (
        <span className="text-caption text-text-muted" style={{ fontFamily: "var(--font-bold)" }}>
          {name.trim().charAt(0).toUpperCase() || <Sparkles className="size-4" aria-hidden />}
        </span>
      )}
    </span>
  );
}

function TagChip({ tag, onYellow }: { tag: HomePromoTag; onYellow?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-0 items-center truncate rounded-pill border px-1.5 text-[11px] leading-none whitespace-nowrap",
        onYellow ? "border-[var(--color-action-yellow-on)]/30 text-[var(--color-action-yellow-on)]" : "border-outline text-text-secondary",
      )}
    >
      {TAG_LABEL[tag]}
    </span>
  );
}

function PromoTile({ promo }: { promo: PreviewPromo }) {
  const yellow = promo.style === "yellow";
  if (promo.imageUrl) {
    return (
      <div className="relative h-full overflow-hidden rounded-card border border-outline bg-surface-variant">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={promo.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute top-2 left-2">
          <Logo url={promo.logoUrl} name={promo.name} size={32} />
        </div>
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center gap-1 px-3 py-1.5",
            yellow ? "bg-[var(--color-action-yellow)] text-[var(--color-action-yellow-on)]" : "bg-surface text-text-primary",
          )}
        >
          <span className="text-caption min-w-0 flex-1 truncate" style={{ fontFamily: "var(--font-bold)" }}>
            {promo.name || "Business name"}
          </span>
          {promo.tapAction === "link" ? <ExternalLink className="size-3.5 shrink-0" aria-hidden /> : null}
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex h-full flex-col justify-between rounded-card border p-3",
        yellow
          ? "border-transparent bg-[var(--color-action-yellow)] text-[var(--color-action-yellow-on)]"
          : "border-outline bg-surface-variant text-text-primary",
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <Logo url={promo.logoUrl} name={promo.name} size={36} />
        <TagChip tag={promo.tag} onYellow={yellow} />
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="text-h3 min-w-0 flex-1 truncate">{promo.name || "Business name"}</span>
        {promo.tapAction === "link" ? <ExternalLink className="size-3.5 shrink-0" aria-hidden /> : null}
      </span>
    </div>
  );
}

function PromoSheet({ promo, onClose }: { promo: PreviewPromo; onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end" data-testid="preview-sheet">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-scrim)]"
        aria-label="Close the sheet preview"
        onClick={onClose}
      />
      <div className="relative flex flex-col items-center gap-3 rounded-t-[24px] bg-surface px-5 pt-3 pb-8">
        <span className="block h-1 w-10 rounded-pill bg-outline" aria-hidden />
        {promo.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={promo.imageUrl} alt="" className="h-28 w-full rounded-card object-cover" />
        ) : null}
        <Logo url={promo.logoUrl} name={promo.name} size={64} />
        <span className="flex flex-col items-center gap-1.5 text-center">
          <span className="text-h3 text-text-primary">{promo.name || "Business name"}</span>
          <TagChip tag={promo.tag} />
        </span>
        {promo.description ? (
          <span className="text-body text-center text-text-secondary">{promo.description}</span>
        ) : null}
        <span
          className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-pill bg-[var(--color-action-yellow)] px-4 text-[var(--color-action-yellow-on)]"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {promo.linkText || "Visit"}
          <ExternalLink className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}
