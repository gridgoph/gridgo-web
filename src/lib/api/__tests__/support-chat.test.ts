import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("support chat API client", () => {
  it("owns the desk routes without touching the landing support desk", () => {
    const src = readFileSync(resolve(__dirname, "../support-chat.ts"), "utf8");
    expect(src).toMatch(/export async function listSupportChatThreads/);
    expect(src).toMatch(/export async function replySupportChat/);
    expect(src).toMatch(/\/support-chat\/threads/);
    expect(src).not.toMatch(/\/support-chat\/me/);
    expect(src).not.toMatch(/support-tickets/);
    expect(src).not.toMatch(/support-desk/);
  });
});
