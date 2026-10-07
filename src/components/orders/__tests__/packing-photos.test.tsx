// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PackingPhotos } from "../PackingPhotos";
vi.mock("../ProductionProgress", () => ({
  ProgressGallery: ({
    label,
    photos,
  }: {
    label: string;
    photos: { fileId: string }[];
  }) => <div aria-label={label}>{photos.map((p) => p.fileId).join(",")}</div>,
  WaitingForPhoto: ({ title, body }: { title: string; body: string }) => (
    <div>
      {title}
      <p>{body}</p>
    </div>
  ),
}));
vi.stubGlobal("React", React);
afterEach(cleanup);
describe("Operations packing evidence", () => {
  it("does not invent evidence for an older API", () => {
    const { container } = render(<PackingPhotos order={{ state: "production" }} />);
    expect(container.textContent).toBe("");
  });
  it("explains the gate while packing and the missing record after dispatch", () => {
    const { rerender } = render(
      <PackingPhotos
        order={{
          state: "production",
          packingProgress: { status: "waiting_for_photo", photos: [] },
        }}
      />,
    );
    expect(screen.getByText(/must send a separate photo/)).toBeTruthy();
    rerender(
      <PackingPhotos
        order={{
          state: "rider_assigned",
          packingProgress: { status: "waiting_for_photo", photos: [] },
        }}
      />,
    );
    expect(screen.getByText(/Older jobs or an Operations correction/)).toBeTruthy();
  });
  it("draws packing photos with their own gallery label", () => {
    render(
      <PackingPhotos
        order={{
          state: "production",
          packingProgress: {
            status: "photos_available",
            photos: [
              { fileId: "packed", contentType: "image/jpeg", at: "2026-10-07T00:00:00Z" },
            ],
          },
        }}
      />,
    );
    expect(screen.getByLabelText("Packing photo").textContent).toBe("packed");
    expect(screen.getByText(/The client sees these/)).toBeTruthy();
  });
});
