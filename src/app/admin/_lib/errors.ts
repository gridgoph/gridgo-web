import { ApiError, isApiError } from "@/lib/api/client";

/** Plain recovery copy from API errors — never surface raw codes alone. */
export function adminErrorMessage(
  err: unknown,
  fallback: string,
): string {
  if (isApiError(err) || err instanceof ApiError) {
    switch (err.kind) {
      case "unauthorized":
        return "Your session expired. Sign in again as Super Admin.";
      case "forbidden":
        return "This action is restricted to Super Admin.";
      case "not_found":
        return "That record was not found. Refresh and try again.";
      case "conflict":
        return `The platform rejected this change (${err.code.replace(/_/g, " ")}). Refresh and review the current state.`;
      case "validation":
        return `Check the form fields and try again (${err.code.replace(/_/g, " ")}).`;
      case "server":
        return "The API failed processing this request. Retry in a moment.";
      default:
        return `${fallback} (${err.code.replace(/_/g, " ")}).`;
    }
  }
  return fallback;
}

/** Pesos typed by admin → minor units. Accepts "1500" or "1500.50". */
export function pesosToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const minor =
    Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(minor) || minor < 0) return null;
  return minor;
}
