import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CLIENT = join(process.cwd(), "src/lib/api/client.ts");
const TYPES = join(process.cwd(), "src/lib/api/types.ts");

describe("announcement client contract", () => {
  it("posts to /announcements and never calls the assumed /admin/broadcasts routes", () => {
    const src = readFileSync(CLIENT, "utf8");
    expect(src).toMatch(/["'`]\/announcements["'`]/);
    expect(src).not.toMatch(/\/admin\/broadcasts/);
    expect(src).toMatch(/export async function postAnnouncement/);
    expect(src).not.toMatch(/listBroadcasts|getBroadcastAudienceSize|sendBroadcast/);
  });

  it("types the live announcement shape, not the assumed broadcast one", () => {
    const src = readFileSync(TYPES, "utf8");
    expect(src).toMatch(/export type AnnouncementAudience/);
    expect(src).toMatch(/notifiedUsers/);
    expect(src).toMatch(/unclaimedDevices/);
    expect(src).not.toMatch(/export type Broadcast\b/);
    expect(src).not.toMatch(/BroadcastAudienceSize/);
    expect(src).not.toMatch(/deliveredCount/);
  });
});
