// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OpsRiderMapPage from "@/app/ops/riders/page";
import type { RiderLocation } from "@/lib/api/types";
import type { RouteResult } from "@/lib/osrm";

vi.stubGlobal("React", React);
const list = vi.hoisted(() => vi.fn<() => Promise<RiderLocation[]>>());
const settings = vi.hoisted(() => vi.fn());
const users = vi.hoisted(() => vi.fn());
const route = vi.hoisted(() => vi.fn<() => Promise<RouteResult>>());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listRiderLocations: list,
  getSettings: settings,
  listUsers: users,
}));
vi.mock("@/lib/osrm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/osrm")>()),
  fetchRoute: route,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
beforeEach(() => {
  settings.mockResolvedValue({
    riderLocationRefreshIntervalSeconds: 20,
    riderLocationStaleAfterSeconds: 120,
  });
  users.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  list.mockReset();
  settings.mockReset();
  users.mockReset();
  route.mockReset();
  Reflect.deleteProperty(window, "L");
  Reflect.deleteProperty(window, "matchMedia");
  document.documentElement.classList.remove("dark");
});

function stubPrefersDark(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
  };
  Object.assign(window, { matchMedia: vi.fn(() => query) });
  return {
    flip(next: boolean) {
      query.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

const NOW = Date.now();

function rider(
  id: string,
  lat: number,
  extra: Partial<RiderLocation> = {},
): RiderLocation {
  return {
    riderId: id,
    name: id,
    vehicleType: "motorcycle",
    plateNumber: "ABC 1234",
    orderId: `order_${id}`,
    orderTitle: null,
    state: "picked_up",
    lat,
    lng: 125.6,
    accuracy: 10,
    at: new Date(NOW).toISOString(),
    pickup: null,
    dropoff: null,
    ...extra,
  };
}

function leafletDouble() {
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
    setIcon: vi.fn(),
    openPopup: vi.fn(),
    remove: vi.fn(),
  });
  const polyline = () => ({
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  });
  const L = {
    map: vi.fn(() => map),
    tileLayer: vi.fn<
      (
        url: string,
        opts: Record<string, unknown>,
      ) => { addTo: () => unknown; remove: () => void }
    >(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
    marker: vi.fn<
      (
        latlng: [number, number],
        opts: Record<string, unknown>,
      ) => ReturnType<typeof marker>
    >(() => marker()),
    divIcon: vi.fn((opts: { html: string; className: string }) => ({ html: opts.html })),
    polyline: vi.fn<
      (
        latlngs: [number, number][],
        opts: Record<string, unknown>,
      ) => ReturnType<typeof polyline>
    >(() => polyline()),
  };
  Object.assign(window, { L });
  return { map, L };
}

it("retains the map viewport and open popup while moving, adding and removing riders", async () => {
  const { map, L } = leafletDouble();
  list
    .mockResolvedValueOnce([rider("rider_a", 7.1)])
    .mockResolvedValueOnce([rider("rider_a", 7.2), rider("rider_b", 7.3)])
    .mockResolvedValueOnce([rider("rider_b", 7.4)]);
  const view = render(<OpsRiderMapPage />);
  await waitFor(() => expect(L.marker).toHaveBeenCalledTimes(1));
  const first = L.marker.mock.results[0]!.value;
  const cameraCalls = map.setView.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(first.setLatLng).toHaveBeenCalledWith([7.2, 125.6]));
  const second = L.marker.mock.results[1]!.value;
  expect(first.setPopupContent).toHaveBeenCalledWith(expect.stringContaining("rider_a"));
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

it("draws the vehicle on the pin and marks a stale fix differently", async () => {
  const { L } = leafletDouble();
  const stale = new Date(NOW - 10 * 60 * 1000).toISOString();
  list.mockResolvedValueOnce([
    rider("van_rider", 7.1, { vehicleType: "van", plateNumber: "VAN 22" }),
    rider("old_rider", 7.2, { vehicleType: "bicycle", at: stale }),
  ]);
  render(<OpsRiderMapPage />);
  await waitFor(() => expect(L.marker).toHaveBeenCalledTimes(2));
  const icons = L.divIcon.mock.calls.map(([opts]) => opts);
  expect(icons[0]!.html).toContain('class="gg-rider-pin"');
  expect(icons[0]!.html).toContain("<svg");
  expect(icons[1]!.html).toContain("gg-rider-pin--stale");
  expect(L.marker.mock.calls[0]![1]).toMatchObject({ alt: "van_rider, Van · VAN 22" });
  expect(screen.getByText(/Van · VAN 22/)).toBeInTheDocument();
  // In the roster and at the top, in the "needs a call" list.
  expect(screen.getAllByText("No update for 10 min")).toHaveLength(1);
  expect(within(screen.getByTestId("stale-riders")).getByText("10 min")).toBeInTheDocument();
});

it("puts riders whose location went quiet first, with Call and Message", async () => {
  const { L } = leafletDouble();
  users.mockResolvedValue([
    { id: "quiet", name: "Quiet", role: "rider", email: "q@x", phone: "+63 917 555 0101" },
  ]);
  list.mockResolvedValueOnce([
    rider("fresh", 7.1),
    rider("quiet", 7.2, { at: new Date(NOW - 240_000).toISOString(), ageSeconds: 240, stale: true }),
    // Accepted the job, never sent a fix: no pin, but the first to call.
    rider("never", 7.3, {
      lat: null,
      lng: null,
      at: null,
      ageSeconds: null,
      lastUpdatedAt: null,
      stale: true,
      state: "rider_assigned",
    }),
  ]);
  render(<OpsRiderMapPage />);
  const card = await screen.findByTestId("stale-riders");
  expect(within(card).getByRole("heading", { name: "2 riders need a call" })).toBeInTheDocument();
  const rows = within(card).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("never");
  expect(rows[0]).toHaveTextContent("Has not sent a location since taking this job.");
  expect(rows[1]).toHaveTextContent("4 min");
  expect(within(rows[0]!).getByRole("link", { name: "Message never" })).toHaveAttribute(
    "href",
    "/ops/chat?with=never&role=rider",
  );
  await waitFor(() =>
    expect(within(rows[1]!).getByRole("link", { name: /Call quiet/i })).toHaveAttribute(
      "href",
      "tel:+639175550101",
    ),
  );
  expect(within(rows[0]!).getByText("No phone number on file")).toBeInTheDocument();
  // Two pins: the rider with no position is not drawn.
  expect(L.marker).toHaveBeenCalledTimes(2);
  expect(screen.getByText("No location sent")).toBeInTheDocument();
});

it("says all is well when every rider is fresh", async () => {
  leafletDouble();
  list.mockResolvedValueOnce([rider("fresh", 7.1, { ageSeconds: 5, stale: false })]);
  render(<OpsRiderMapPage />);
  expect(await screen.findByTestId("stale-riders-clear")).toHaveTextContent(
    "in the last 2 minutes",
  );
});

it("re-reads at the refresh interval set by Super Admin", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  leafletDouble();
  settings.mockResolvedValue({
    riderLocationRefreshIntervalSeconds: 15,
    riderLocationStaleAfterSeconds: 120,
  });
  list.mockResolvedValue([rider("rider_a", 7.1)]);
  render(<OpsRiderMapPage />);
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/Updates every 15 seconds/)).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(15_000);
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});

it("draws the road route to the drop-off and marks both ends of the trip", async () => {
  const { L } = leafletDouble();
  const dropoff = { lat: 7.05, lng: 125.55, label: "Client home" };
  const pickup = { lat: 7.2, lng: 125.7, label: "Lovis Printshop" };
  route.mockResolvedValue({
    routed: true,
    distanceMetres: 4200,
    durationSeconds: 840,
    coordinates: [
      [125.6, 7.1],
      [125.58, 7.08],
      [125.55, 7.05],
    ],
  });
  list
    .mockResolvedValueOnce([rider("rider_a", 7.1, { pickup, dropoff })])
    // Moved 5 m: no new route request, the line stays.
    .mockResolvedValueOnce([rider("rider_a", 7.10004, { pickup, dropoff })]);
  render(<OpsRiderMapPage />);
  await waitFor(() => expect(L.polyline).toHaveBeenCalledTimes(2));
  // rider + pickup + drop-off pins
  expect(L.marker).toHaveBeenCalledTimes(3);
  expect(L.marker.mock.calls[1]![1]).toMatchObject({ alt: "Pickup: Lovis Printshop" });
  expect(L.marker.mock.calls[2]![1]).toMatchObject({ alt: "Drop-off: Client home" });
  // Leaflet wants [lat, lng]; the router speaks [lng, lat].
  expect(L.polyline.mock.calls[1]![0]).toEqual([
    [7.1, 125.6],
    [7.08, 125.58],
    [7.05, 125.55],
  ]);
  expect(L.polyline.mock.calls[1]![1]).toMatchObject({ color: "#ffde58" });
  expect(route).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/4\.2 km · 14 min to drop-off/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  const pin = L.marker.mock.results[0]!.value;
  await waitFor(() => expect(pin.setLatLng).toHaveBeenCalledWith([7.10004, 125.6]));
  expect(route).toHaveBeenCalledTimes(1);
  expect(L.polyline).toHaveBeenCalledTimes(2);
});

it("shows a direct dashed line and says so when routing is unavailable", async () => {
  const { L } = leafletDouble();
  const dropoff = { lat: 7.05, lng: 125.55, label: "Client home" };
  route.mockResolvedValue({
    routed: false,
    distanceMetres: 7300,
    durationSeconds: null,
    coordinates: [
      [125.6, 7.1],
      [125.55, 7.05],
    ],
  });
  list.mockResolvedValueOnce([rider("rider_a", 7.1, { dropoff })]);
  render(<OpsRiderMapPage />);
  await waitFor(() => expect(L.polyline).toHaveBeenCalledTimes(1));
  expect(L.polyline.mock.calls[0]![1]).toMatchObject({ dashArray: "6 8" });
  expect(screen.getByText(/7\.3 km direct · road route unavailable/)).toBeInTheDocument();
});

it("pans to a rider and opens their pin from the roster", async () => {
  const { map, L } = leafletDouble();
  list.mockResolvedValueOnce([rider("rider_a", 7.1), rider("rider_b", 7.3)]);
  render(<OpsRiderMapPage />);
  await waitFor(() => expect(L.marker).toHaveBeenCalledTimes(2));
  const second = L.marker.mock.results[1]!.value;
  fireEvent.click(screen.getByRole("button", { name: "Show rider_b on the map" }));
  await waitFor(() => expect(second.openPopup).toHaveBeenCalledTimes(1));
  expect(map.setView).toHaveBeenLastCalledWith([7.3, 125.6], 15);
});

it("tones the map for the dark theme and redraws the route in its colours", async () => {
  const media = stubPrefersDark(false);
  const { L } = leafletDouble();
  const dropoff = { lat: 7.05, lng: 125.55, label: "Client home" };
  route.mockResolvedValue({
    routed: true,
    distanceMetres: 1000,
    durationSeconds: 300,
    coordinates: [
      [125.6, 7.1],
      [125.55, 7.05],
    ],
  });
  list.mockResolvedValueOnce([rider("rider_a", 7.1, { dropoff })]);
  const view = render(<OpsRiderMapPage />);
  await waitFor(() => expect(L.polyline).toHaveBeenCalledTimes(2));
  const wrapper = view.container.querySelector(".gg-map")!;
  expect(wrapper).not.toHaveClass("gg-map--dark");
  media.flip(true);
  await waitFor(() => expect(wrapper).toHaveClass("gg-map--dark"));
  // One tile source in both themes; the route is redrawn and the old lines are gone.
  expect(L.tileLayer).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(L.polyline).toHaveBeenCalledTimes(4));
  expect(L.polyline.mock.results[0]!.value.remove).toHaveBeenCalledTimes(1);
});

it("honours the portal's .dark class without a system preference", async () => {
  document.documentElement.classList.add("dark");
  const { L } = leafletDouble();
  list.mockResolvedValueOnce([rider("rider_a", 7.1)]);
  const view = render(<OpsRiderMapPage />);
  await waitFor(() => expect(L.tileLayer).toHaveBeenCalledTimes(1));
  expect(view.container.querySelector(".gg-map")).toHaveClass("gg-map--dark");
});
