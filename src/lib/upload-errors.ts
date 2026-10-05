/**
 * Why an upload (`POST /files`) was refused, in words a shop can act on
 * (gridgoph/gridgo-web#74; the error contract is in gridgo-api PR #158).
 *
 *  - `415 invalid_file_type`: `reason` says which check failed and
 *    `allowedContentTypes` what this kind of file accepts.
 *  - `413 file_too_large`: `maxMiB` (and `maxBytes`) is the limit.
 *  - `503 minio_unavailable` / `storage_initializing`: the only time to say
 *    file storage is unavailable.
 *
 * The API's own `message` names the internal purpose ("fulfilment_proof"), so
 * the copy is built here from the details instead. Pure: no React, no fetch.
 */

import { isApiError } from "@/lib/api/client";

const TYPE_NAMES: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
  "image/vnd.adobe.photoshop": "Photoshop",
};

/** ["image/jpeg", "image/png", "application/pdf"] → "JPEG, PNG or PDF". */
export function allowedTypesLabel(types: readonly unknown[] | undefined): string | null {
  const names = [
    ...new Set(
      (types ?? [])
        .filter((type): type is string => typeof type === "string")
        .map((type) => TYPE_NAMES[type] ?? type.split("/").pop()?.toUpperCase() ?? type),
    ),
  ];
  if (!names.length) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function sizeLabel(err: { detail: <T>(key: string) => T | undefined }): string | null {
  const mib = err.detail<number>("maxMiB");
  if (typeof mib === "number" && Number.isFinite(mib) && mib > 0) {
    return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MB`;
  }
  const bytes = err.detail<number>("maxBytes");
  if (typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0) {
    const value = bytes / 1024 / 1024;
    return `${Number.isInteger(value) ? value : value.toFixed(1)} MB`;
  }
  return null;
}

/**
 * The real reason an upload failed. `what` names the file in the sentence
 * ("this photo", "this evidence"); `notSent` finishes the storage sentence.
 */
export function uploadErrorMessage(
  err: unknown,
  {
    what = "this file",
    notSent = "was not sent",
  }: { what?: string; notSent?: string } = {},
): string {
  if (!isApiError(err)) {
    return `The connection dropped, so ${what} ${notSent}. Check the connection and try again.`;
  }
  const allowed = allowedTypesLabel(err.detail<unknown[]>("allowedContentTypes"));
  const choose = allowed ? `Choose a ${allowed} file.` : "Choose a different file.";
  switch (err.code) {
    case "file_too_large": {
      const limit = sizeLabel(err);
      return limit
        ? `${capitalise(what)} is larger than ${limit}, the limit for this upload. Choose a smaller file or a lower-resolution photo.`
        : `${capitalise(what)} is too large for this upload. Choose a smaller file or a lower-resolution photo.`;
    }
    case "invalid_file_type":
      switch (err.detail<string>("reason")) {
        case "heic_not_supported":
        case "heic_unsupported":
          return `iPhone HEIC photos are not accepted. Set the camera to "Most Compatible", or export the photo as JPEG, then try again.`;
        case "file_type_mismatch":
          return `The file's name and contents do not agree (for example, a renamed file). Export it again as a real ${allowed ?? "JPEG, PNG or PDF"} file.`;
        case "purpose_media_type_not_allowed": {
          const detected = allowedTypesLabel([err.detail<string>("detectedContentType")]);
          return detected
            ? `A ${detected} cannot be used here. ${choose}`
            : `That kind of file cannot be used here. ${choose}`;
        }
        default:
          return `That kind of file is not accepted. ${choose}`;
      }
    case "file_empty":
      return `${capitalise(what)} is empty. Choose the file again.`;
    case "file_required":
    case "filename_required":
      return "No file arrived. Choose the file again.";
    case "minio_unavailable":
    case "storage_initializing":
      return `File storage is unavailable right now, so ${what} ${notSent}. Try again in a minute.`;
    default:
      if (err.kind === "unauthorized")
        return "Your session expired. Sign in again, then upload.";
      if (err.kind === "forbidden") return "This account cannot upload files here.";
      if (err.status >= 500) {
        return `The server could not take ${what} just now, so it ${notSent}. Try again in a minute.`;
      }
      return `${capitalise(what)} ${notSent}. Try again.`;
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
