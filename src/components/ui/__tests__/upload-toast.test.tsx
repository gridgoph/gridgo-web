// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Toaster, createToastManager } from "@/components/ui/toast";
import { beginUpload } from "@/lib/upload-activity";
import { UploadInterrupted } from "@/lib/api/multipart";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

vi.stubGlobal("React", React);
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

it("keeps upload progress and cancellation accessible while a modal is open", () => {
  render(
    <Toaster toastManager={createToastManager()}>
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Upload evidence</DialogTitle>
        </DialogContent>
      </Dialog>
    </Toaster>,
  );
  let update!: ReturnType<typeof beginUpload>;
  act(() => {
    update = beginUpload("evidence.pdf", () => update({ phase: "failed" }));
  });
  act(() => {
    update({ phase: "sending", loaded: 512, total: 1024 });
  });
  expect(
    screen.getByRole("progressbar", { name: "Sending evidence.pdf" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel upload of evidence.pdf" }));
  expect(screen.getByText("Upload stopped")).toBeInTheDocument();
});

it("shows real bytes, then saving, and only marks stored after acceptance", () => {
  render(
    <Toaster toastManager={createToastManager()}>
      <div>Editor</div>
    </Toaster>,
  );
  let update!: ReturnType<typeof beginUpload>;
  act(() => {
    update = beginUpload("photo.jpg", () => {});
  });
  act(() => {
    update({ phase: "sending", loaded: 512 * 1024, total: 1024 * 1024 });
  });
  expect(screen.getByRole("progressbar", { name: "Sending photo.jpg" })).toHaveAttribute(
    "aria-valuenow",
    "50",
  );
  expect(screen.getByText(/512 KB of 1 MB/)).toBeInTheDocument();
  expect(screen.queryByText("File stored")).not.toBeInTheDocument();
  act(() => {
    update({ phase: "saving" });
  });
  expect(screen.getByText("Saving file…")).toBeInTheDocument();
  expect(screen.queryByText("File stored")).not.toBeInTheDocument();
  act(() => {
    update({ phase: "stored" });
  });
  expect(screen.getByText("File stored")).toBeInTheDocument();
  expect(screen.getByText(/form may still be saving/i)).toBeInTheDocument();
});

it("keeps an unknown total indeterminate and offers cancellation", () => {
  render(
    <Toaster toastManager={createToastManager()}>
      <div>Editor</div>
    </Toaster>,
  );
  let update!: ReturnType<typeof beginUpload>;
  act(() => {
    update = beginUpload("evidence.pdf", () => {
      update({
        phase: "failed",
        error: new UploadInterrupted("upload_cancelled", "Upload cancelled."),
      });
    });
  });
  act(() => {
    update({ phase: "sending", loaded: 1024, total: null });
  });
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  fireEvent.click(screen.getByRole("button", { name: "Cancel upload of evidence.pdf" }));
  expect(screen.getByText("Upload cancelled.")).toBeInTheDocument();
});

it("shows a stalled upload's recovery message", () => {
  render(
    <Toaster toastManager={createToastManager()}>
      <div>Editor</div>
    </Toaster>,
  );
  let update!: ReturnType<typeof beginUpload>;
  act(() => {
    update = beginUpload("photo.jpg", () => {});
  });
  act(() => {
    update({
      phase: "failed",
      error: new UploadInterrupted(
        "upload_stalled",
        "No upload bytes were sent for 60 seconds. Check your connection and try again.",
      ),
    });
  });
  expect(screen.getByText(/60 seconds.*connection/i)).toBeInTheDocument();
  expect(screen.queryByText("File stored")).not.toBeInTheDocument();
});
