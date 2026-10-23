// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ShopHelp } from "../ShopHelp";
vi.stubGlobal("React", React);
afterEach(cleanup);
it("replays all steps with the unpacked rider flow, then restarts from the beginning", async () => {
  const user = userEvent.setup();
  render(<ShopHelp />);
  expect(
    screen.getByText(/does not install or update the separate mobile app/),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Replay the tour" }));
  expect(screen.getByText("Jobs find your shop")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText(/Do not pack yet/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText(/filing proof does not release money/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("button", { name: "Replay the tour" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Replay the tour" }));
  expect(screen.getByText("Jobs find your shop")).toBeVisible();
});
