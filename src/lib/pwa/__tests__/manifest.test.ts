import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const publicDir = path.resolve(__dirname, "../../../../public");
/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): string {
  const bytes = readFileSync(path.join(publicDir, file));
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

const manifest = JSON.parse(
  readFileSync(path.join(publicDir, "supplier.webmanifest"), "utf8"),
);

describe("the supplier web app manifest", () => {
  it("installs as GRIDGO Supplier, full screen, starting on the shop's dashboard", () => {
    expect(manifest.name).toBe("GRIDGO Supplier");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/supplier/dashboard");
    expect(manifest.id).toBe("/supplier/");
  });

  it("keeps sign-in inside the app's scope, or iPhone would leave the app for Safari", () => {
    // /login and /sso-callback sit outside /supplier/; an out-of-scope
    // navigation on iOS opens a separate browser with its own cookies.
    expect("/login".startsWith(manifest.scope)).toBe(true);
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it("ships 192 and 512 icons as both any and maskable, at their stated sizes", () => {
    for (const purpose of ["any", "maskable"]) {
      const sizes = manifest.icons
        .filter((icon: { purpose: string }) => icon.purpose === purpose)
        .map((icon: { sizes: string }) => icon.sizes);
      expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    }
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      expect(pngSize(icon.src.slice(1))).toBe(icon.sizes);
    }
    expect(pngSize("pwa/apple-touch-icon.png")).toBe("180x180");
    expect(pngSize("pwa/badge-96.png")).toBe("96x96");
  });
});
