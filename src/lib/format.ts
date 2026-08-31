/** Format PHP minor units (centavos) for display. */
export function formatPhp(minor: number): string {
  return `₱${(minor / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Pesos typed by a shop → PHP minor units. Accepts "400" or "400.00". */
export function pesosToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(minor) || minor < 0) return null;
  return minor;
}

export function minorToPesosInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Short date/time for deadlines and timeline rows. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
