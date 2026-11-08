// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { assignRiderErrorMessage } from "@/app/ops/_lib/dispatch";
import { ApiError } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

type Settings = Awaited<ReturnType<typeof import("@/lib/api/client").getSettings>>;
import { useQueueContext } from "@/lib/live/useQueueContext";

vi.stubGlobal("React", React);
const getSettings = vi.hoisted(() => vi.fn());
const listDispatchOffers = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
  listDispatchOffers,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function Probe() {
  useQueueContext();
  return null;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each(["resolve", "reject"] as const)(
  "settles quietly when its reads %s after unmount",
  async (outcome) => {
    const settings = deferred<Settings>();
    const offers = deferred<Order[]>();
    getSettings.mockReturnValue(settings.promise);
    listDispatchOffers.mockReturnValue(offers.promise);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = render(<Probe />);
    expect(listDispatchOffers).toHaveBeenCalled();
    unmount();

    if (outcome === "resolve") {
      settings.resolve({ operatingHours: null } as unknown as Settings);
      offers.resolve([]);
    } else {
      settings.reject(new Error("gone"));
      offers.reject(new Error("gone"));
    }
    await Promise.allSettled([settings.promise, offers.promise]);
    await new Promise((done) => setTimeout(done, 0));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  },
);

it("says when the shop opens for dispatch instead of a generic conflict", () => {
  const err = new ApiError(409, {
    error: "outside_shop_hours",
    message: "Dispatch resumes when the shop and GRIDGO are open.",
    nextDispatchAt: "2026-11-09T16:00:00.000Z",
  });
  expect(assignRiderErrorMessage(err)).toMatch(
    /^The shop is closed for dispatch\. Assign a rider from .*12:00 AM/,
  );
  expect(
    assignRiderErrorMessage(new ApiError(409, { error: "outside_shop_hours" })),
  ).toBe("The shop is closed for dispatch. Assign a rider when it opens.");
});
