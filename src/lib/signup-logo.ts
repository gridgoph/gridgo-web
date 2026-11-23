/**
 * The logo a shop picked on "Your shop", held in this tab's memory across
 * the hop from `/signup` to `/supplier/setup`, where the new shop can own it.
 * A picture is never written to storage; a reload simply drops it (the logo
 * is optional and can be added later).
 */

let held: File | null = null;

export function holdSignupLogo(file: File | null): void {
  held = file;
}

/** The held logo, once: taking it clears it. */
export function takeSignupLogo(): File | null {
  const file = held;
  held = null;
  return file;
}
