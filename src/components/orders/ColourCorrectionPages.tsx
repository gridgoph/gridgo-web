import { CoverageGlyph } from "@/components/colour/CoverageGlyph";
import type { Order, OrderChangeRequest } from "@/lib/api/types";
import {
  bpsPercent,
  quoteA3Limit,
  readColourQuote,
  tierLabel,
  type ColourQuote,
} from "@/lib/colour-pricing";
import { formatPhp } from "@/lib/format";

/** The line's original reading, for "was" beside each corrected page. */
export function originalColourOf(
  order: Pick<Order, "productionItems">,
  lineItemId: string | null,
): ColourQuote | null {
  const item = (order.productionItems ?? []).find((row) => row.id === lineItemId);
  return item ? readColourQuote(item.colourPricing) : null;
}

/**
 * A shop's corrected colour pages on a change request: each page's reading
 * and sheet rate, with what GRIDGO measured beside it when it differs. Only
 * the pages that moved are listed; the rest are said in one line.
 */
export function ColourCorrectionPages({
  request,
  original,
}: {
  request: Pick<OrderChangeRequest, "colourCorrection">;
  original: ColourQuote | null;
}) {
  const correction = readColourQuote(request.colourCorrection);
  if (!correction) return null;
  const limit = original ? quoteA3Limit(original) : quoteA3Limit(correction);
  const before = new Map((original?.pages ?? []).map((page) => [`${page.fileId}:${page.page}`, page]));
  const moved = correction.pages.filter((page) => {
    const was = before.get(`${page.fileId}:${page.page}`);
    return !was || was.strongColourBps !== page.strongColourBps || was.sheetPriceMinor !== page.sheetPriceMinor;
  });
  const same = correction.pages.length - moved.length;
  return (
    <div className="flex flex-col gap-1.5" data-testid="colour-correction-pages">
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {moved.map((page) => {
          const was = before.get(`${page.fileId}:${page.page}`);
          return (
            <li key={`${page.fileId}:${page.page}`} className="flex items-start gap-2">
              <CoverageGlyph bps={page.strongColourBps} size="sm" />
              <span className="min-w-0">
                <span className="text-body text-text-primary block tabular-nums">
                  Page {page.page}: {bpsPercent(page.strongColourBps)} strong colour
                  {page.tier ? `, ${tierLabel(page.tier, limit)}` : ""}
                  {page.sheetPriceMinor != null ? `, ${formatPhp(page.sheetPriceMinor)} a sheet` : ""}
                </span>
                {was ? (
                  <span className="text-caption text-text-muted block tabular-nums">
                    GRIDGO measured {bpsPercent(was.strongColourBps)}
                    {was.sheetPriceMinor != null ? `, ${formatPhp(was.sheetPriceMinor)} a sheet` : ""}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {same && moved.length ? (
        <span className="text-caption text-text-muted">
          {same === 1 ? "1 other page keeps" : `${same} other pages keep`} GRIDGO&rsquo;s reading
          and price.
        </span>
      ) : null}
      {!moved.length ? (
        <span className="text-caption text-text-muted">Every page keeps GRIDGO&rsquo;s reading.</span>
      ) : null}
    </div>
  );
}
