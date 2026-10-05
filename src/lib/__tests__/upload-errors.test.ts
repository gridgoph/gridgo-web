import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import { allowedTypesLabel, uploadErrorMessage } from "@/lib/upload-errors";

const refusal = (status: number, body: Record<string, unknown>) =>
  new ApiError(status, body);

describe("uploadErrorMessage", () => {
  it("names the size limit instead of blaming storage", () => {
    const message = uploadErrorMessage(
      refusal(413, {
        error: "file_too_large",
        purpose: "fulfilment_proof",
        maxBytes: 26214400,
        maxMiB: 25,
      }),
      { what: "this evidence", notSent: "was not filed" },
    );
    expect(message).toBe(
      "This evidence is larger than 25 MB, the limit for this upload. Choose a smaller file or a lower-resolution photo.",
    );
    expect(message).not.toMatch(/storage/i);
    expect(message).not.toMatch(/fulfilment_proof/);
  });

  it("falls back to maxBytes when maxMiB is absent", () => {
    expect(
      uploadErrorMessage(
        refusal(413, { error: "file_too_large", maxBytes: 5 * 1024 * 1024 }),
        {
          what: "this photo",
        },
      ),
    ).toMatch(/larger than 5 MB/);
  });

  it("lists the types this upload accepts for an unsupported file", () => {
    expect(
      uploadErrorMessage(
        refusal(415, {
          error: "invalid_file_type",
          reason: "content_type_not_allowed",
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
          ],
        }),
      ),
    ).toBe("That kind of file is not accepted. Choose a JPEG, PNG, WebP or PDF file.");
  });

  it("explains HEIC, renamed files and a type this purpose refuses", () => {
    expect(
      uploadErrorMessage(
        refusal(415, { error: "invalid_file_type", reason: "heic_not_supported" }),
      ),
    ).toMatch(/HEIC photos are not accepted/);
    expect(
      uploadErrorMessage(
        refusal(415, {
          error: "invalid_file_type",
          reason: "file_type_mismatch",
          allowedContentTypes: ["image/jpeg", "image/png"],
        }),
      ),
    ).toMatch(/name and contents do not agree.*JPEG or PNG/);
    expect(
      uploadErrorMessage(
        refusal(415, {
          error: "invalid_file_type",
          reason: "purpose_media_type_not_allowed",
          detectedContentType: "application/pdf",
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
        }),
        { what: "this photo" },
      ),
    ).toBe("A PDF cannot be used here. Choose a JPEG, PNG or WebP file.");
  });

  it("keeps the storage message for storage failures only", () => {
    expect(
      uploadErrorMessage(refusal(503, { error: "minio_unavailable" }), {
        what: "this photo",
      }),
    ).toBe(
      "File storage is unavailable right now, so this photo was not sent. Try again in a minute.",
    );
    expect(uploadErrorMessage(refusal(503, { error: "storage_initializing" }))).toMatch(
      /File storage is unavailable/,
    );
    expect(uploadErrorMessage(refusal(500, { error: "internal" }))).not.toMatch(
      /storage/i,
    );
  });

  it("says the connection dropped when nothing came back", () => {
    expect(uploadErrorMessage(new TypeError("Failed to fetch"))).toMatch(
      /connection dropped/,
    );
  });
});

describe("allowedTypesLabel", () => {
  it("reads MIME types as names", () => {
    expect(allowedTypesLabel(["image/jpeg"])).toBe("JPEG");
    expect(allowedTypesLabel(["image/jpeg", "image/jpeg", "application/pdf"])).toBe(
      "JPEG or PDF",
    );
    expect(allowedTypesLabel([])).toBeNull();
    expect(allowedTypesLabel(undefined)).toBeNull();
  });
});
