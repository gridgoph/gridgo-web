// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getFile = vi.hoisted(() => vi.fn());
const getFileDownloadUrl = vi.hoisted(() => vi.fn());
const deleteFileEarly = vi.hoisted(() => vi.fn());
const listAudit = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());

vi.stubGlobal("React", React);
// Base UI checkboxes dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, init);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ApiError: actual.ApiError,
    isApiError: actual.isApiError,
    getFile: (...args: unknown[]) => getFile(...args),
    getFileDownloadUrl: (...args: unknown[]) => getFileDownloadUrl(...args),
    deleteFileEarly: (...args: unknown[]) => deleteFileEarly(...args),
    listAudit: (...args: unknown[]) => listAudit(...args),
    getUser: (...args: unknown[]) => getUser(...args),
  };
});

import { FileDeletionAccessProvider } from "@/components/files/FileDeletionAccess";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { ApiError } from "@/lib/api/client";
import type { AuditEntry, StoredFile } from "@/lib/api/types";

afterEach(() => {
  cleanup();
  for (const mock of [getFile, getFileDownloadUrl, deleteFileEarly, listAudit, getUser]) {
    mock.mockReset();
  }
});

function proofFile(partial: Partial<StoredFile> = {}): StoredFile {
  return {
    fileId: "file_proof",
    purpose: "payment_proof",
    originalFilename: "transfer.png",
    declaredContentType: "image/png",
    detectedContentType: "image/png",
    size: 200 * 1024,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-09-15T10:00:00.000Z",
    readyAt: "2026-09-15T10:00:01.000Z",
    deleteRequestedAt: null,
    deletedAt: null,
    references: [{ type: "order", id: "ord_1", field: "payments" }],
    ...partial,
  };
}

const deletion: AuditEntry = {
  id: "aud_1",
  at: "2026-10-04T10:00:00.000Z",
  actorId: "user_super",
  actorRole: "super_admin",
  action: "file.early_delete",
  entityType: "file",
  entityId: "file_proof",
  orderId: null,
  detail: { purpose: "payment_proof" },
  reason: "Duplicate upload",
};

function plate(access?: { deleteEarly?: boolean; readRecord?: boolean }) {
  const node = <EvidencePlate fileId="file_proof" label="QR proof" deletable />;
  return render(
    access ? <FileDeletionAccessProvider {...access}>{node}</FileDeletionAccessProvider> : node,
  );
}

function loadsFine() {
  getFile.mockResolvedValue(proofFile());
  getFileDownloadUrl.mockResolvedValue("https://files.test/transfer.png");
}

describe("early delete on a file plate", () => {
  it("is not offered outside a tree that grants it (supplier)", async () => {
    loadsFine();
    plate();
    expect(await screen.findByRole("img", { name: "transfer.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete .* early/ })).not.toBeInTheDocument();
  });

  it("is not offered to Operations, who may only read the record", async () => {
    loadsFine();
    plate({ readRecord: true });
    expect(await screen.findByRole("img", { name: "transfer.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete .* early/ })).not.toBeInTheDocument();
  });

  it("is not offered on a plate that is not an order file", async () => {
    loadsFine();
    render(
      <FileDeletionAccessProvider deleteEarly>
        <EvidencePlate fileId="file_proof" label="Receiving QR" />
      </FileDeletionAccessProvider>,
    );
    expect(await screen.findByRole("img", { name: "transfer.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete .* early/ })).not.toBeInTheDocument();
  });

  it("shows what goes, needs a reason and the cannot-be-undone tick, then records who and why", async () => {
    const user = userEvent.setup();
    loadsFine();
    deleteFileEarly.mockResolvedValue(proofFile({ state: "deleted", deletedAt: deletion.at }));
    listAudit.mockResolvedValue([deletion]);
    getUser.mockResolvedValue({ id: "user_super", name: "Desk Lead" });
    plate({ deleteEarly: true });

    await user.click(await screen.findByRole("button", { name: "Delete QR proof early" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("transfer.png");
    expect(dialog).toHaveTextContent(/QR proof, payment screenshot/);
    expect(dialog).toHaveTextContent("200 KB");
    expect(dialog).toHaveTextContent("Order ord_1");
    expect(dialog).toHaveTextContent(/cannot be undone/);

    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Why it is being deleted"), "  Duplicate upload ");
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(deleteFileEarly).toHaveBeenCalledWith("file_proof", "Duplicate upload");
    expect(await screen.findByText("File deleted")).toBeInTheDocument();
    expect(await screen.findByText(/Deleted early by Desk Lead, Super Admin, on/)).toBeInTheDocument();
    expect(screen.getByText("Duplicate upload")).toBeInTheDocument();
    expect(listAudit).toHaveBeenCalledWith({ entityType: "file", entityId: "file_proof", limit: 20 });
  });

  it("keeps the file and says why when an open case holds it", async () => {
    const user = userEvent.setup();
    loadsFine();
    deleteFileEarly.mockRejectedValue(new ApiError(409, { error: "file_retention_hold" }));
    plate({ deleteEarly: true });

    await user.click(await screen.findByRole("button", { name: "Delete QR proof early" }));
    await user.type(await screen.findByLabelText("Why it is being deleted"), "Wrong file");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/open issue, claim, refund/);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("a deleted file's plate", () => {
  it("says who deleted it and why to a tree that reads the record", async () => {
    getFile.mockRejectedValue(new ApiError(404, { error: "file_not_found" }));
    getFileDownloadUrl.mockRejectedValue(new ApiError(404, { error: "file_not_found" }));
    listAudit.mockResolvedValue([deletion]);
    getUser.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    plate({ readRecord: true });

    expect(await screen.findByText("File deleted")).toBeInTheDocument();
    expect(await screen.findByText(/Deleted early by Super Admin on/)).toBeInTheDocument();
    expect(screen.getByText("Duplicate upload")).toBeInTheDocument();
    expect(screen.queryByText(/Retry the page/)).not.toBeInTheDocument();
  });

  it("says only that it is gone where the record is not readable", async () => {
    getFile.mockRejectedValue(new ApiError(404, { error: "file_not_found" }));
    getFileDownloadUrl.mockRejectedValue(new ApiError(404, { error: "file_not_found" }));
    plate();

    expect(await screen.findByText("This file is no longer available.")).toBeInTheDocument();
    await waitFor(() => expect(listAudit).not.toHaveBeenCalled());
  });
});
