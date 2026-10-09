// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Typing through userEvent is slow on a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

import type { LegalDocument } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  getLegalDocument: vi.fn(),
  updateLegalDraft: vi.fn(),
  publishLegalDocument: vi.fn(),
  deleteLegalDocument: vi.fn(),
  uploadLegalPdf: vi.fn(),
  getFileDownloadUrl: vi.fn(),
}));

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

const placeholderDraft = {
  title: "Supplier Agreement",
  audience: "supplier" as const,
  text: "Placeholder: Supplier Agreement.",
  pdfFileId: null,
  placeholder: true,
  material: false,
  penalties: false,
  changeSummary: "Launch placeholder",
  effectiveAt: "2026-01-01T00:00:00.000Z",
};

function supplierAgreement(): LegalDocument {
  return {
    id: "supplier-agreement",
    revision: 1,
    launchSlot: true,
    draft: placeholderDraft,
    versions: [
      {
        ...placeholderDraft,
        id: "supplier-agreement-1",
        documentId: "supplier-agreement",
        version: 1,
        pdfUrl: null,
        publishedAt: "2026-01-01T00:00:00.000Z",
        status: "placeholder",
      },
    ],
  };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getLegalDocument.mockResolvedValue(supplierAgreement());
  api.updateLegalDraft.mockImplementation(async (_id: string, revision: number, changes: object) => ({
    id: "supplier-agreement",
    revision: revision + 1,
    draft: { ...placeholderDraft, ...changes },
  }));
  api.publishLegalDocument.mockResolvedValue({
    document: { id: "v2", version: 2, material: true },
    revision: 3,
  });
});
afterEach(cleanup);

describe("LegalDocumentView", () => {
  it("saves the edits, then publishes that revision, after the material acknowledgement", async () => {
    const user = userEvent.setup();
    render(<LegalDocumentView tree="admin" canEdit documentId="supplier-agreement" />);

    const text = await screen.findByLabelText("Text");
    await user.clear(text);
    await user.type(text, "Reviewed text.");
    await user.click(screen.getByText("This is still placeholder text"));
    const summary = screen.getByLabelText("What changed");
    await user.clear(summary);
    await user.type(summary, "First reviewed text.");

    // The first real text is always material: the editor says so before publish.
    expect(screen.getByText(/first real text of this document/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publish version 2" }));
    expect(
      await screen.findByText("Every print shop will have to accept version 2 before they can keep using the shop app."),
    ).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Publish version 2" }).at(-1)!;
    expect(confirm).toBeDisabled();
    expect(api.updateLegalDraft).not.toHaveBeenCalled();

    await user.click(screen.getByText("I understand every print shop will have to accept again."));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(api.publishLegalDocument).toHaveBeenCalledWith("supplier-agreement", 2));
    const [id, revision, changes] = api.updateLegalDraft.mock.calls[0];
    expect(id).toBe("supplier-agreement");
    expect(revision).toBe(1);
    expect(changes).toMatchObject({
      text: "Reviewed text.",
      placeholder: false,
      changeSummary: "First reviewed text.",
    });
    expect(api.updateLegalDraft.mock.invocationCallOrder[0]).toBeLessThan(
      api.publishLegalDocument.mock.invocationCallOrder[0],
    );
  });

  it("explains a missing change summary instead of sending it", async () => {
    const user = userEvent.setup();
    render(<LegalDocumentView tree="admin" canEdit documentId="supplier-agreement" />);
    const summary = await screen.findByLabelText("What changed");
    await user.clear(summary);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByText(/Say what changed/)).toBeInTheDocument();
    expect(api.updateLegalDraft).not.toHaveBeenCalled();
  });

  it("gives Operations the versions and no editor", async () => {
    render(<LegalDocumentView tree="ops" canEdit={false} documentId="supplier-agreement" />);
    expect(await screen.findByText("Only Super Admin can edit and publish legal documents.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Text")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Published versions" })).toBeInTheDocument();
  });
});
