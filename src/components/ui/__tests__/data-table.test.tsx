// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

vi.stubGlobal("React", React);

type Row = { id: string; title: string; amountMinor: number; zone: string };

const ROWS: Row[] = [
  { id: "a", title: "Banner run", amountMinor: 300, zone: "Davao North" },
  { id: "b", title: "Sticker pack", amountMinor: 100, zone: "Davao East" },
  { id: "c", title: "Card box", amountMinor: 200, zone: "Davao North" },
];

const COLUMNS: DataTableColumn<Row>[] = [
  {
    id: "title",
    header: "Order",
    primary: true,
    sortValue: (r) => r.title,
    cell: (r) => <span>{r.title}</span>,
  },
  {
    id: "amount",
    header: "Expected",
    sortValue: (r) => r.amountMinor,
    cell: (r) => <span>{r.amountMinor}</span>,
  },
  {
    id: "zone",
    header: "Zone",
    sortValue: (r) => r.zone,
    cell: (r) => <span>{r.zone}</span>,
  },
];

/** The desktop table; the same rows also render as cards for <768px. */
function tableBodyText(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent ?? "");
}

afterEach(cleanup);

describe("DataTable", () => {
  it("sorts by a column when its header is activated", async () => {
    const user = userEvent.setup();
    render(
      <DataTable columns={COLUMNS} data={ROWS} getRowId={(r) => r.id} caption="Orders" />,
    );

    const table = screen.getByRole("table");
    await user.click(within(table).getByRole("button", { name: /Expected/ }));
    expect(tableBodyText().map((t) => t.match(/\d+/)?.[0])).toEqual([
      "100",
      "200",
      "300",
    ]);

    await user.click(within(table).getByRole("button", { name: /Expected/ }));
    expect(tableBodyText().map((t) => t.match(/\d+/)?.[0])).toEqual([
      "300",
      "200",
      "100",
    ]);
  });

  it("filters across every column's text", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        getRowId={(r) => r.id}
        filterPlaceholder="Filter orders…"
      />,
    );

    await user.type(screen.getByPlaceholderText("Filter orders…"), "sticker");
    expect(tableBodyText()).toHaveLength(1);
    expect(tableBodyText()[0]).toContain("Sticker pack");
  });

  it("tells a filtered-to-nothing table apart from an empty queue", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        getRowId={(r) => r.id}
        filterPlaceholder="Filter orders…"
        empty={<p>No orders yet</p>}
      />,
    );

    await user.type(screen.getByPlaceholderText("Filter orders…"), "zzzz");
    expect(screen.getAllByText(/No rows match what you searched for/).length).toBeGreaterThan(0);
    expect(screen.queryByText("No orders yet")).not.toBeInTheDocument();
  });

  it("hands an empty data set back to the page's own empty state", () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        getRowId={(r) => r.id}
        empty={<p>No orders yet</p>}
      />,
    );
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("paginates rather than growing without limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `row-${i}`,
      title: `Order ${i}`,
      amountMinor: i,
      zone: "Davao North",
    }));
    render(
      <DataTable columns={COLUMNS} data={many} getRowId={(r) => r.id} pageSize={5} />,
    );

    expect(tableBodyText()).toHaveLength(5);
    expect(screen.getByText(/1–5/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("holds the table's layout while loading instead of showing nothing", () => {
    render(
      <DataTable columns={COLUMNS} data={[]} getRowId={(r) => r.id} loading empty={<p>No orders yet</p>} />,
    );
    expect(screen.queryByText("No orders yet")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("keeps row actions reachable on both the table and the mobile card", () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={[ROWS[0]]}
        getRowId={(r) => r.id}
        rowActions={(r) => <button type="button">Review {r.title}</button>}
      />,
    );
    // One in the table row, one on the card rendered for narrow viewports.
    expect(screen.getAllByRole("button", { name: "Review Banner run" })).toHaveLength(2);
  });
});
