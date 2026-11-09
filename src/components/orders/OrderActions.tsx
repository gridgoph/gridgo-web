"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { OrderAction } from "@/lib/api/types";
import { orderActionRows } from "@/lib/shop-team";

/** Rows shown before "Show all": enough for a shift, short enough to scan. */
export const ORDER_ACTIONS_PREVIEW = 6;

/**
 * Who did what on an order, newest first: the person's name, their Owner or
 * Staff role (or Operations, GRIDGO for automation) and when. Shown to the
 * shop and to Operations; the API never sends it to the client.
 */
export function OrderActions({ actions }: { actions: readonly OrderAction[] | undefined }) {
  const [all, setAll] = useState(false);
  const rows = orderActionRows(actions);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, ORDER_ACTIONS_PREVIEW);
  return (
    <div className="flex flex-col gap-2" data-testid="order-actions">
      <ul className="m-0 flex list-none flex-col p-0">
        {shown.map((row) => (
          <li
            key={row.id}
            className="border-outline-subtle flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-2 last:border-b-0"
          >
            <span className="text-body text-text-primary min-w-0">
              <span style={{ fontFamily: "var(--font-medium)" }}>{row.who}</span>
              <span className="text-text-secondary"> {row.what.toLowerCase()}</span>
            </span>
            <time dateTime={row.at} className="text-caption text-text-muted whitespace-nowrap">
              {row.when}
            </time>
          </li>
        ))}
      </ul>
      {rows.length > ORDER_ACTIONS_PREVIEW ? (
        <Button variant="ghost" className="self-start" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      ) : null}
    </div>
  );
}
