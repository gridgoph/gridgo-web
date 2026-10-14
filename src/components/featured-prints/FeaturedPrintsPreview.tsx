"use client";

import { SampleFrame } from "@/components/featured-prints/SampleFrame";
import {
  FEATURED_PRINTS_EMPTY_MESSAGE,
  FEATURED_PRINTS_GREETING,
  FEATURED_PRINTS_TITLE,
  clientPriceLine,
  clientUnitLine,
  type FeaturedCard,
} from "@/lib/featured-prints";

const MEDIUM = { fontFamily: "var(--font-medium)" } as const;

/**
 * The client's Home row, drawn from the cards that would go out on save.
 *
 * Phone width, because that is where clients read it: two cards and the edge
 * of a third, the overhang that tells a client the shelf scrolls. Unavailable
 * products are left out, as the public read leaves them out. Nothing here can
 * name a shop: the cards carry no shop field to draw.
 */
export function FeaturedPrintsPreview({
  cards,
  onStalePhoto,
}: {
  cards: FeaturedCard[];
  onStalePhoto?: () => void;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[24px] border border-outline bg-canvas"
      data-testid="featured-prints-preview"
    >
      <div className="flex flex-col gap-3 px-4 pb-5 pt-4">
        <div className="flex flex-col gap-1">
          <p className="text-overline text-text-muted m-0">{FEATURED_PRINTS_TITLE}</p>
          <p className="text-caption text-text-secondary m-0">{FEATURED_PRINTS_GREETING}</p>
        </div>
        {cards.length ? (
          <ul
            className="-mr-4 flex list-none gap-3 overflow-x-auto p-0 pr-4 m-0"
            aria-label="Featured Prints as clients see them"
          >
            {cards.map((card) => (
              <li
                key={card.id}
                className="w-[140px] shrink-0 overflow-hidden rounded-card border border-outline bg-surface"
              >
                <SampleFrame photo={card.photo} onStale={onStalePhoto} />
                <div className="flex flex-col gap-1 px-3 pb-3">
                  <p
                    className="text-body text-text-primary m-0 line-clamp-2 min-h-[2lh]"
                    style={MEDIUM}
                  >
                    {card.name}
                  </p>
                  <div className="flex flex-col">
                    <span className="text-body text-text-primary tabular-nums" style={MEDIUM}>
                      {clientPriceLine(card)}
                    </span>
                    <span className="text-caption text-text-secondary">
                      {clientUnitLine(card)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-card border border-outline bg-surface p-4">
            <p className="text-body text-text-primary m-0">{FEATURED_PRINTS_EMPTY_MESSAGE}</p>
            <p className="text-caption text-text-muted m-0 mt-1">
              With nothing featured, clients get this prompt and a link to the catalogue.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
