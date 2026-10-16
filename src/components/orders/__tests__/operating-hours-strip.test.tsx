// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OperatingHoursStrip } from "@/components/orders/OperatingHoursStrip";
import { LAUNCH_OPERATING_HOURS } from "@/lib/operating-hours";

vi.stubGlobal("React", React);
afterEach(cleanup);

// Monday 12 Oct 2026 in Manila.
const MONDAY_10AM = Date.parse("2026-10-12T02:00:00.000Z");
const SUNDAY_10AM = Date.parse("2026-10-11T02:00:00.000Z");

it("reads the week back to Operations, open or closed", () => {
  render(<OperatingHoursStrip hours={LAUNCH_OPERATING_HOURS} now={MONDAY_10AM} />);
  const strip = screen.getByTestId("operating-hours-strip");
  expect(strip).toHaveTextContent(/Open now, until 5:00\sPM/);
  expect(strip).toHaveTextContent(/Mon to Sat: 8:00\sAM to 5:00\sPM\. Reviews take 1 hour\./);
  expect(strip).toHaveTextContent(/Waits count open hours only\. Super Admin sets these hours\./);
  cleanup();

  render(<OperatingHoursStrip hours={LAUNCH_OPERATING_HOURS} now={SUNDAY_10AM} />);
  expect(screen.getByTestId("operating-hours-strip")).toHaveTextContent(
    /Closed\. Opens tomorrow, 8:00\sAM/,
  );
});

it("says a closure is today rather than calling it the next one", () => {
  const closures = [
    { startDay: "2026-10-12", endDay: "2026-10-12" },
    { startDay: "2026-12-25", endDay: "2026-12-26" },
  ];
  const hours = {
    ...LAUNCH_OPERATING_HOURS,
    schedule: { ...LAUNCH_OPERATING_HOURS.schedule, closures },
  };
  render(<OperatingHoursStrip hours={hours} now={MONDAY_10AM} />);
  const strip = screen.getByTestId("operating-hours-strip");
  expect(strip).toHaveTextContent(/Closed\. Opens tomorrow, 8:00\sAM/);
  expect(strip).toHaveTextContent(/Closed today for a closure/);
  expect(strip).not.toHaveTextContent(/Next closure/);
  cleanup();

  render(<OperatingHoursStrip hours={hours} now={SUNDAY_10AM} />);
  expect(screen.getByTestId("operating-hours-strip")).toHaveTextContent(/Next closure: Mon/);
});
