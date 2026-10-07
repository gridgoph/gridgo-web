import { describe, expect, it } from "vitest";

import { validateSupportChatImage } from "@/lib/chatImages";

function file(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateSupportChatImage", () => {
  it("accepts a jpeg under the size cap", () => {
    expect(validateSupportChatImage(file("shot.jpg", "image/jpeg", 240))).toBeNull();
  });

  it("refuses a pdf and an empty file", () => {
    expect(validateSupportChatImage(file("notes.pdf", "application/pdf", 240))).toBe(
      "Choose a JPEG, PNG, or WebP photo.",
    );
    expect(validateSupportChatImage(file("empty.png", "image/png", 0))).toBe("That file is empty.");
  });
});
