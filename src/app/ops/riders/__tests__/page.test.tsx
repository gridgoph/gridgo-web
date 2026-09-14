// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import OpsRiderMapPage from "@/app/ops/riders/page";
import type { RiderLocation } from "@/lib/api/types";

vi.stubGlobal("React", React);
const list = vi.hoisted(() => vi.fn<() => Promise<RiderLocation[]>>());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listRiderLocations: list,
}));
afterEach(() => {
  cleanup();
  list.mockReset();
  Reflect.deleteProperty(window, "L");
});

function rider(id: string, lat: number): RiderLocation {
  return {
    riderId: id,
    name: id,
    orderId: `order_${id}`,
    orderTitle: null,
    state: "picked_up",
    lat,
    lng: 125.6,
    accuracy: 10,
    at: "2026-09-15T00:00:00Z",
  };
}

it("retains the map viewport and open popup while moving, adding and removing riders", async () => {
  const map = {
    setView: vi.fn().mockReturnThis(),
    fitBounds: vi.fn(),
    remove: vi.fn(),
  };
  const marker = () => ({
    addTo: vi.fn().mockReturnThis(),
    bindPopup: vi.fn(),
    setPopupContent: vi.fn(),
    setLatLng: vi.fn(),
    remove: vi.fn(),
  });
  const first = marker();
  const second = marker();
  const L = {
    map: vi.fn(() => map),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
  };
  Object.assign(window, { L });
  list
    .mockResolvedValueOnce([rider("rider_a", 7.1)])
    .mockResolvedValueOnce([rider("rider_a", 7.2), rider("rider_b", 7.3)])
    .mockResolvedValueOnce([rider("rider_b", 7.4)]);
  const view = render(<OpsRiderMapPage />);
  await waitFor(() => expect(first.bindPopup).toHaveBeenCalledTimes(1));
  const cameraCalls = map.setView.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(first.setLatLng).toHaveBeenCalledWith([7.2, 125.6]),
  );
  expect(first.setPopupContent).toHaveBeenCalledWith(
    expect.stringContaining("rider_a"),
  );
  expect(first.bindPopup).toHaveBeenCalledTimes(1);
  expect(first.remove).not.toHaveBeenCalled();
  expect(second.bindPopup).toHaveBeenCalledTimes(1);
  expect(L.map).toHaveBeenCalledTimes(1);
  expect(L.tileLayer).toHaveBeenCalledTimes(1);
  expect(map.setView).toHaveBeenCalledTimes(cameraCalls);
  expect(map.fitBounds).not.toHaveBeenCalled();
  expect(map.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(first.remove).toHaveBeenCalledTimes(1));
  expect(second.setLatLng).toHaveBeenCalledWith([7.4, 125.6]);
  expect(L.marker).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(map.remove).toHaveBeenCalledTimes(1);
});
