"use client";

import { useRef, useSyncExternalStore } from "react";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "Take photo": straight to the phone's camera.
 *
 * A plain file input already offers the camera on a phone, but behind a sheet
 * of choices. This one asks for the rear camera directly (`capture`), which is
 * what a shop wants when it photographs a job on the press. It accepts
 * `image/*` because a camera only ever returns a JPEG; the neighbouring
 * "Choose" control keeps the exact JPEG/PNG/WebP list, which is also what makes
 * an iPhone convert a HEIC library photo before it uploads.
 *
 * Shown only where the main pointer is a finger. On a desktop `capture` is
 * ignored and the button would open the same file picker as its neighbour.
 */

const COARSE = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(COARSE);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

function readCoarse(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(COARSE).matches;
}

/** True on a touch-first device (a phone or tablet). */
export function useTouchFirst(): boolean {
  return useSyncExternalStore(subscribe, readCoarse, () => false);
}

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  /** Say what the photo is of, e.g. "Photograph the plate". */
  label?: string;
  /** The input's own name for assistive tech, when the button label is generic. */
  inputLabel?: string;
  variant?: "secondary" | "outline";
  size?: "default" | "sm";
  className?: string;
};

export function TakePhotoButton({
  onFile,
  disabled = false,
  label = "Take photo",
  inputLabel,
  variant = "secondary",
  size = "default",
  className,
}: Props) {
  const touchFirst = useTouchFirst();
  const input = useRef<HTMLInputElement>(null);
  if (!touchFirst) return null;
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Camera data-icon="inline-start" aria-hidden />
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={inputLabel ?? label}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
