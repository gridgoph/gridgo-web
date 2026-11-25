import type { MemberPerkInput } from "@/lib/api/organization-partners";
import {
  PERK_CEILING_NOTE,
  dayWords,
  lastPerkDay,
  memberLabel,
  ordersWords,
  perkAmountWords,
} from "@/lib/organization-partners";

const medium = { fontFamily: "var(--font-medium)" } as const;

/**
 * The perk as a member reads it. The amount is always "up to": the real
 * figure on an order is quoted by the API at checkout, never worked out here.
 */
export function PerkPreview({
  perk,
  label,
}: {
  /** Null until every field can be read. */
  perk: Pick<
    MemberPerkInput,
    "enabled" | "amountMinor" | "maxOrdersPerTerm" | "endsAt"
  > | null;
  /** The organization's short name, when the perk is for one organization. */
  label: string | null;
}) {
  return (
    <div
      className="rounded-field border-outline-subtle bg-surface-variant flex flex-col gap-1 border p-3"
      data-testid="perk-preview"
    >
      {!perk ? (
        <p className="text-body text-text-secondary m-0">
          Fill in every field to see what members see.
        </p>
      ) : !perk.enabled ? (
        <>
          <p className="text-body text-text-primary m-0" style={medium}>
            No perk
          </p>
          <p className="text-body text-text-secondary m-0">
            The perk is off, so members see nothing at checkout and no one gets money off.
          </p>
        </>
      ) : (
        <>
          <p className="text-caption text-text-muted m-0">
            {label ? memberLabel(label) : "Every partner without its own perk"}
          </p>
          <p className="text-h3 text-text-primary m-0 break-words">
            {perkAmountWords(perk.amountMinor)}
          </p>
          <p className="text-body text-text-secondary m-0">
            {ordersWords(perk.maxOrdersPerTerm)} per member each term, until{" "}
            {dayWords(lastPerkDay(perk.endsAt))}
          </p>
          <p className="text-caption text-text-muted m-0 mt-1">{PERK_CEILING_NOTE}</p>
        </>
      )}
    </div>
  );
}
