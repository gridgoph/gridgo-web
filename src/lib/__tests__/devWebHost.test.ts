import { describe, expect, it } from "vitest";

import {
  bounceToIsolatedDevWebHost,
  GRIDGO_DEV_WEB_HOST,
  hostnamePortFromHostHeader,
  isolatedDevWebHref,
} from "@/lib/devWebHost";

function loc(hostname: string, port = "3000") {
  return {
    protocol: "http:",
    hostname,
    port,
    pathname: "/login",
    search: "?next=1",
    hash: "#top",
  };
}

describe("isolatedDevWebHref", () => {
  it("keeps the portal on its own Clerk cookie host", () => {
    expect(GRIDGO_DEV_WEB_HOST).toBe("portal.localhost");
    expect(isolatedDevWebHref(loc("localhost"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://portal.localhost:3000/login?next=1#top",
    );
    expect(isolatedDevWebHref(loc("127.0.0.1"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://portal.localhost:3000/login?next=1#top",
    );
    expect(isolatedDevWebHref(loc("[::1]"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://portal.localhost:3000/login?next=1#top",
    );
    expect(isolatedDevWebHref(loc("::1"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://portal.localhost:3000/login?next=1#top",
    );
  });

  it("does not bounce an already-isolated or LAN origin", () => {
    expect(isolatedDevWebHref(loc(GRIDGO_DEV_WEB_HOST), GRIDGO_DEV_WEB_HOST)).toBeNull();
    expect(isolatedDevWebHref(loc("192.168.80.49"), GRIDGO_DEV_WEB_HOST)).toBeNull();
    expect(isolatedDevWebHref(loc("192.168.110.139"), GRIDGO_DEV_WEB_HOST)).toBeNull();
  });
});

describe("bounceToIsolatedDevWebHost", () => {
  it("is a no-op under Jest/Vitest workers even on loopback", () => {
    expect(bounceToIsolatedDevWebHost(GRIDGO_DEV_WEB_HOST)).toBe(false);
  });
});

describe("hostnamePortFromHostHeader", () => {
  it("reads the browser host so Next nextUrl localhost is not used", () => {
    expect(hostnamePortFromHostHeader("portal.localhost:3000")).toEqual({
      hostname: "portal.localhost",
      port: "3000",
    });
    expect(hostnamePortFromHostHeader("localhost:3000")).toEqual({
      hostname: "localhost",
      port: "3000",
    });
    expect(hostnamePortFromHostHeader("[::1]:3000")).toEqual({
      hostname: "[::1]",
      port: "3000",
    });
    expect(hostnamePortFromHostHeader(null)).toBeNull();
  });
});
