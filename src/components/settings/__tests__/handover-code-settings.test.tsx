// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { deliveryZones } from "@/test/delivery-zones";

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
  updateSettings,
}));
const { OperationalSettings } = await import("@/components/settings/OperationalSettings");
const { HandoverCodeSettings } =
  await import("@/components/settings/HandoverCodeSettings");
const settings: PlatformSettings = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: deliveryZones(),
  handoverOtpEnabled: false,
  hubPickup: { schedule: null, feeMinor: 0 },
};
const card = () => within(screen.getByRole("region", { name: "Handover codes" }));
const toggle = () => card().getByRole("switch", { name: "Handover codes" });
const save = () => card().getByRole("button", { name: "Save handover codes" });
const props = { settings, canEdit: true, onSaved: vi.fn(), onConflict: vi.fn() };
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each([false, true])(
  "saves a change from %s separately with a version and reason",
  async (enabled) => {
    getSettings.mockResolvedValue({ ...settings, handoverOtpEnabled: enabled });
    updateSettings.mockImplementation(async (input) => ({
      ...settings,
      ...input,
      version: 5,
    }));
    render(<OperationalSettings />);
    await screen.findByRole("region", { name: "Handover codes" });
    expect(toggle()).toHaveAttribute("aria-checked", String(enabled));
    expect(save()).toBeDisabled();
    fireEvent.click(toggle());
    expect(updateSettings).not.toHaveBeenCalled();
    fireEvent.click(save());
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        expectedVersion: 4,
        handoverOtpEnabled: !enabled,
        reason: `Handover codes: ${enabled ? "on to off" : "off to on"}`,
      }),
    );
    expect(await card().findByRole("status")).toHaveTextContent("Handover codes saved.");
    expect(save()).toBeDisabled();
    expect(card().getByText(/In force right now/)).toHaveTextContent(
      enabled ? "Off" : "On",
    );
  },
);

it("warns about unset hours and rider builds, and discards without writing", () => {
  render(<HandoverCodeSettings {...props} />);
  expect(card().getByRole("note", { name: "Hub hours" })).toHaveTextContent(
    "Hub hours are not set",
  );
  expect(card().getByText(/recent rider app/)).toBeInTheDocument();
  expect(
    card().getByText(/Turning this off does not remove codes already issued/),
  ).toBeInTheDocument();
  fireEvent.click(toggle());
  fireEvent.click(card().getByRole("button", { name: "Discard" }));
  expect(toggle()).toHaveAttribute("aria-checked", "false");
  expect(save()).toBeDisabled();
  expect(updateSettings).not.toHaveBeenCalled();
});

it("reloads a stale version, keeps the choice, and retries only on an explicit save", async () => {
  getSettings
    .mockResolvedValueOnce(settings)
    .mockResolvedValue({ ...settings, version: 6 });
  updateSettings
    .mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }))
    .mockResolvedValue({ ...settings, version: 7, handoverOtpEnabled: true });
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Handover codes" });
  fireEvent.click(toggle());
  fireEvent.click(save());
  await card().findByText(/Someone else saved settings/);
  await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
  expect(toggle()).toHaveAttribute("aria-checked", "true");
  expect(updateSettings).toHaveBeenCalledTimes(1);
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenLastCalledWith({
      expectedVersion: 6,
      handoverOtpEnabled: true,
      reason: "Handover codes: off to on",
    }),
  );
});

it("follows refreshed values while clean and shows no warning for configured hours", () => {
  const { rerender } = render(<HandoverCodeSettings {...props} />);
  rerender(
    <HandoverCodeSettings
      {...props}
      settings={{
        ...settings,
        handoverOtpEnabled: true,
        hubPickup: {
          feeMinor: 0,
          schedule: {
            utcOffsetMinutes: 480,
            week: [{ weekday: 1, opensMinute: 540, closesMinute: 1020 }],
          },
        },
      }}
    />,
  );
  expect(toggle()).toHaveAttribute("aria-checked", "true");
  expect(save()).toBeDisabled();
  expect(card().queryByRole("note", { name: "Hub hours" })).not.toBeInTheDocument();
});

it("does not offer controls to a read-only caller or an older API", () => {
  const { rerender } = render(<HandoverCodeSettings {...props} canEdit={false} />);
  expect(card().queryByRole("switch")).not.toBeInTheDocument();
  expect(card().queryByRole("button")).not.toBeInTheDocument();
  rerender(
    <HandoverCodeSettings
      {...props}
      settings={{ ...settings, handoverOtpEnabled: undefined }}
    />,
  );
  expect(card().getByText(/settings are not available yet/)).toBeInTheDocument();
  expect(card().queryByRole("switch")).not.toBeInTheDocument();
  expect(updateSettings).not.toHaveBeenCalled();
});

it("locks during saving and leaves a failed change available for retry", async () => {
  let reject!: (error: unknown) => void;
  updateSettings.mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  render(<HandoverCodeSettings {...props} />);
  fireEvent.click(toggle());
  fireEvent.click(save());
  expect(toggle()).toHaveAttribute("aria-disabled", "true");
  expect(card().getByRole("button", { name: "Saving…" })).toBeDisabled();
  await act(async () => reject(new ApiError(403, { error: "forbidden" })));
  expect(
    card().getByText("Only Super Admin can change handover codes."),
  ).toBeInTheDocument();
  expect(save()).toBeEnabled();
  expect(props.onSaved).not.toHaveBeenCalled();
});

it("does not carry an unsaved handover choice in the page save", async () => {
  getSettings.mockResolvedValue(settings);
  updateSettings.mockResolvedValue({ ...settings, version: 5, issueWindowHours: 48 });
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Handover codes" });
  fireEvent.click(toggle());
  fireEvent.change(screen.getByLabelText("Hours after delivery"), {
    target: { value: "48" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("handoverOtpEnabled");
  expect(toggle()).toHaveAttribute("aria-checked", "true");
  expect(card().getByText(/In force right now/)).toHaveTextContent("Off");
});
