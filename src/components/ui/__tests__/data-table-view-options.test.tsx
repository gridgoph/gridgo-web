// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTableViewOptions } from "@/components/ui/data-table";

vi.stubGlobal("React", React);

// Base UI only mounts menu children when open. jsdom cannot reliably click the
// trigger (zero-size layout + missing PointerEvent), so force the popup open.
// That is the crash path: GroupLabel without a Group.
vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/dropdown-menu")>();
  return {
    ...actual,
    DropdownMenu: (props: React.ComponentProps<typeof actual.DropdownMenu>) => (
      <actual.DropdownMenu defaultOpen {...props} />
    ),
  };
});

afterEach(cleanup);

const HEADERS = ["Order", "Expected", "Zone", "Reference"] as const;

function ViewOptionsHarness() {
  const table = useReactTable({
    data: [{ id: "row-1" }],
    columns: HEADERS.map((header) => ({
      id: header.toLowerCase(),
      header,
      accessorFn: () => header,
      enableHiding: true,
      meta: { gridgo: { header } },
    })),
    getCoreRowModel: getCoreRowModel(),
  });
  return <DataTableViewOptions table={table} />;
}

describe("DataTableViewOptions", () => {
  it("renders the Columns menu without throwing on a missing Menu.Group", () => {
    render(<ViewOptionsHarness />);

    expect(screen.getByText("Show columns")).toBeInTheDocument();
    for (const header of HEADERS) {
      expect(screen.getByRole("menuitemcheckbox", { name: header })).toBeChecked();
    }
  });
});
