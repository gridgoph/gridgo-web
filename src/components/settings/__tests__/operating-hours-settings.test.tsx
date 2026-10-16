// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { LAUNCH_OPERATING_HOURS, closureDayLabel } from "@/lib/operating-hours";

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
const updateSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  updateSettings,
}));
const { OperatingHoursSettings } = await import(
  "@/components/settings/OperatingHoursSettings"
);

// Sunday 11 Oct 2026, 10:00 AM Manila: closed on the launch week.
const SUNDAY_10AM = new Date("2026-10-11T02:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SUNDAY_10AM);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  updateSettings.mockReset();
});

const settings = {
  version: 7,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [],
  operatingHours: LAUNCH_OPERATING_HOURS,
} as unknown as PlatformSettings;

function renderEditor(props: Partial<React.ComponentProps<typeof OperatingHoursSettings>> = {}) {
  const onSaved = vi.fn();
  const onConflict = vi.fn();
  render(
    <OperatingHoursSettings
      settings={settings}
      canEdit
      onSaved={onSaved}
      onConflict={onConflict}
      {...props}
    />,
  );
  return { onSaved, onConflict };
}

it("reads the week, says GRIDGO is closed and what a client ordering now is told", () => {
  renderEditor();
  expect(screen.getByTestId("operating-status")).toHaveTextContent(
    "Closed. Opens tomorrow, 8:00 AM",
  );
  expect(screen.getByLabelText("Open on Sunday")).not.toBeChecked();
  expect(screen.getByLabelText("Open on Saturday")).toBeChecked();
  expect(screen.getByTestId("operating-preview-result")).toHaveTextContent(
    /Outside operating hours.*reviewed Monday, (12 Oct|Oct 12).*8:00\sAM, done by 9:00\sAM/,
  );
  expect(screen.getByRole("button", { name: "Save operating hours" })).toBeDisabled();
});

it("saves the whole object through the handshake with a reason naming what moved", async () => {
  const { onSaved } = renderEditor();
  updateSettings.mockImplementation(async (input) => ({
    ...settings,
    version: 8,
    operatingHours: input.operatingHours,
  }));

  fireEvent.click(screen.getByLabelText("Open on Saturday"));
  fireEvent.change(screen.getByLabelText("Artwork review time"), {
    target: { value: "90" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add a closure" }));
  fireEvent.change(screen.getByLabelText("Closure 1 first day"), {
    target: { value: "2026-12-25" },
  });
  fireEvent.change(screen.getByLabelText("Why (optional)"), {
    target: { value: "Holiday plan" },
  });

  expect(screen.getByTestId("operating-changes")).toHaveTextContent(
    /Saturday closed.*Review time 1 hour to 1 hour 30 minutes.*Closed Fri, (25 Dec|Dec 25),? 2026/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save operating hours" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings).toHaveBeenCalledWith({
    expectedVersion: 7,
    operatingHours: {
      ...LAUNCH_OPERATING_HOURS,
      schedule: {
        ...LAUNCH_OPERATING_HOURS.schedule,
        week: LAUNCH_OPERATING_HOURS.schedule.week.filter((day) => day.weekday !== 6),
        closures: [{ startDay: "2026-12-25", endDay: "2026-12-25" }],
      },
      artworkReviewMinutes: 90,
    },
    reason:
      `Operating hours: Saturday closed; review time 1 hour to 1 hour 30 minutes; closed ${closureDayLabel("2026-12-25")}. Holiday plan`,
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(await screen.findByText(/Saved and recorded in Audit Logs/)).toBeInTheDocument();
});

it("explains a draft the API would refuse and never sends it", () => {
  renderEditor();
  fireEvent.change(screen.getByLabelText("Monday closes"), { target: { value: "07:00" } });
  expect(screen.getByTestId("operating-problem")).toHaveTextContent(
    "Monday: closing time must be after opening time",
  );
  expect(screen.getByRole("button", { name: "Save operating hours" })).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Monday closes"), { target: { value: "17:00" } });
  fireEvent.change(screen.getByLabelText("Artwork review time"), {
    target: { value: "600" },
  });
  expect(screen.getByTestId("operating-problem")).toHaveTextContent(/1 to 540/);
  expect(updateSettings).not.toHaveBeenCalled();
});

it("reloads the settings when someone else saved first", async () => {
  const { onConflict } = renderEditor();
  updateSettings.mockRejectedValue(new ApiError(409, { error: "settings_version_conflict" }));
  fireEvent.change(screen.getByLabelText("Artwork review time"), {
    target: { value: "45" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save operating hours" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Someone else saved settings/);
  expect(onConflict).toHaveBeenCalled();
});

it("shows the same week without controls to anyone who cannot edit", () => {
  renderEditor({ canEdit: false });
  expect(screen.queryByRole("button", { name: "Save operating hours" })).toBeNull();
  expect(screen.queryByLabelText("Open on Monday")).toBeNull();
  expect(screen.getByText("Only Super Admin changes these.")).toBeInTheDocument();
});
