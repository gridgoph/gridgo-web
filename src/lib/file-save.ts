/**
 * Saves an order file under its original name, from a signed link asked for
 * on the click and never kept: the link only lasts minutes, and its host is
 * not this site, so an anchor with `download` would open the file instead of
 * saving it. The bytes go through a blob URL on this origin.
 */

import { getFileDownloadUrl } from "@/lib/api/client";

/** Long enough for any browser to have started the save from the blob. */
const REVOKE_AFTER_MS = 10_000;

export async function saveFileById(fileId: string, filename: string): Promise<void> {
  await saveRemoteFile(await getFileDownloadUrl(fileId), filename);
}

/** Saves the bytes behind a signed link already asked for on this click. */
export async function saveRemoteFile(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("download failed");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Safari and some Firefox builds drop a save whose URL is revoked in the
    // same task as the click, so let the save start first.
    setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_AFTER_MS);
  }
}
