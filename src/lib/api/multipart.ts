/** Multipart has its own budget; JSON continues to use requestDeadline.ts. */
export const UPLOAD_STALL_MS = 60_000;
// Matches the API's default UPLOAD_REQUEST_TIMEOUT_MS. The API still enforces
// each purpose's file size/type limits; this is a time bound, not a size bypass.
export const UPLOAD_MAX_MS = 15 * 60_000;

export class UploadInterrupted extends Error {
  constructor(
    readonly code:
      "upload_stalled" | "upload_timeout" | "upload_cancelled" | "upload_connection",
    message: string,
  ) {
    super(message);
    this.name =
      code === "upload_cancelled"
        ? "AbortError"
        : code === "upload_connection"
          ? "NetworkError"
          : "TimeoutError";
  }
}

export type UploadProgress = {
  phase: "sending" | "saving";
  loaded: number;
  total: number | null;
};

/** XHR is required for real upload byte events in supported browsers. */
export function sendMultipart(
  url: string,
  body: FormData,
  headers: Record<string, string>,
  signal: AbortSignal,
  progress: (value: UploadProgress) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const xhr = new XMLHttpRequest();
    let loaded = 0;
    let total: number | null = null;
    let saving = false;
    let settled = false;
    let stall: ReturnType<typeof setTimeout>;
    const maximum = setTimeout(
      () =>
        stop(
          new UploadInterrupted(
            "upload_timeout",
            saving
              ? "Saving the file took too long. It may have been stored. Check this screen before trying again."
              : "The upload reached its 15-minute limit. Check your connection and try again.",
          ),
        ),
      UPLOAD_MAX_MS,
    );

    function cleanup() {
      clearTimeout(stall);
      clearTimeout(maximum);
      signal.removeEventListener("abort", cancel);
    }
    function stop(reason: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      // Settle first: xhr.abort() synchronously emits abort in browsers.
      reject(reason);
      xhr.abort();
    }
    function cancel() {
      stop(signal.reason);
    }
    function resetStall() {
      clearTimeout(stall);
      stall = setTimeout(
        () =>
          stop(
            new UploadInterrupted(
              "upload_stalled",
              "No upload bytes were sent for 60 seconds. Check your connection and try again.",
            ),
          ),
        UPLOAD_STALL_MS,
      );
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (settled || saving) return;
      // Repeated events with the same byte count are not progress.
      if (event.loaded > loaded) resetStall();
      loaded = Math.max(loaded, event.loaded);
      total = event.lengthComputable && event.total > 0 ? event.total : null;
      progress({ phase: "sending", loaded, total });
    });
    xhr.upload.addEventListener("load", () => {
      if (settled) return;
      saving = true;
      clearTimeout(stall);
      progress({ phase: "saving", loaded: total ?? loaded, total });
    });
    xhr.addEventListener("load", () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status: xhr.status, text: xhr.responseText });
    });
    xhr.addEventListener("error", () =>
      stop(
        new UploadInterrupted(
          "upload_connection",
          saving
            ? "The connection dropped while saving. The file may have been stored. Check this screen before trying again."
            : "The upload connection dropped. Check your connection and try again.",
        ),
      ),
    );
    xhr.addEventListener("abort", () =>
      stop(new UploadInterrupted("upload_cancelled", "Upload cancelled.")),
    );
    signal.addEventListener("abort", cancel, { once: true });
    try {
      // Register upload listeners before open/send (including Safari/Firefox).
      xhr.open("POST", url);
      for (const [name, value] of Object.entries(headers))
        xhr.setRequestHeader(name, value);
      resetStall();
      progress({ phase: "sending", loaded, total });
      signal.throwIfAborted();
      xhr.send(body); // Browser supplies the multipart boundary. Never set Content-Type.
    } catch (error) {
      stop(error);
    }
  });
}
