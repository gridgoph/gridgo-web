import { describe, expect, it } from "vitest";

import { formatPhp } from "@/lib/format";
import { getApiBase } from "@/lib/api/client";

describe("formatPhp", () => {
  it("formats minor units as PHP pesos", () => {
    expect(formatPhp(120000)).toMatch(/1,200\.00/);
    expect(formatPhp(0)).toMatch(/0\.00/);
  });
});

describe("getApiBase", () => {
  it("defaults to local demo API", () => {
    const prev = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(getApiBase()).toBe("http://127.0.0.1:8787");
    if (prev !== undefined) process.env.NEXT_PUBLIC_API_URL = prev;
  });

  it("strips trailing slash from env override", () => {
    const prev = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://example.test:9000/";
    expect(getApiBase()).toBe("http://example.test:9000");
    if (prev !== undefined) process.env.NEXT_PUBLIC_API_URL = prev;
    else delete process.env.NEXT_PUBLIC_API_URL;
  });
});
