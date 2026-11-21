/**
 * An order's reference as a person reads it out, the same as the shop's phone
 * app (gridgo-supplier `lib/orderReference.ts`): `ord_3ff0128e105a` reads
 * "3FF0-128E-105A". No new number is minted, so what a shop quotes is exactly
 * what Operations searches by.
 */
const PREFIX = /^ord[_-]/i;

export function orderReference(id: string | null | undefined): string | null {
  const raw = (id ?? "").trim();
  if (!raw) return null;
  const bare = raw.replace(PREFIX, "").toUpperCase();
  if (!bare) return null;
  if (!/^[0-9A-F]{8,}$/.test(bare)) return bare;
  return bare.match(/.{1,4}/g)?.join("-") ?? bare;
}
