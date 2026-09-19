import { isApiError } from "@/lib/api/client";
import type { CatalogEntryUsage } from "@/lib/api/types";

/** The two chart entries a Super Admin can delete from their own editor. */
export type DangerEntryKind = "category" | "print job";

export type DeleteRefusal = {
  reason: "in_use" | "shipped";
  title: string;
  /** Plain sentences the editor prints under the title, in this order. */
  lines: string[];
  /** Whether "Hide from new listings" is still a useful offer (false once hidden). */
  canRetire: boolean;
};

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function shopNames(shops: CatalogEntryUsage["shops"]): string {
  const names = shops.map((shop) => shop.shopName).filter(Boolean);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/**
 * Sentences for a `409 catalog_entry_in_use` breakdown, in the chart's own
 * voice ("shops already file against this"). Zero figures are left out.
 */
export function usageLines(usage: CatalogEntryUsage, kind: DangerEntryKind): string[] {
  const lines: string[] = [];
  if ((usage.printJobs ?? 0) > 0) {
    lines.push(
      `${plural(usage.printJobs ?? 0, "print job still sits", "print jobs still sit")} under it. Move or delete each one first.`,
    );
  }
  if ((usage.services ?? 0) > 0) {
    lines.push(`${plural(usage.services ?? 0, "shop is", "shops are")} accredited here.`);
  }
  if (usage.listings > 0) {
    const from = usage.shops.length
      ? ` from ${plural(usage.shops.length, "shop")}: ${shopNames(usage.shops)}`
      : "";
    lines.push(
      `${plural(usage.listings, "listing is", "listings are")} filed against ${kind === "category" ? "its print jobs" : "it"}${from}.`,
    );
  }
  if (usage.orders > 0) {
    lines.push(
      `${plural(usage.orders, "order was", "orders were")} placed against those listings.`,
    );
  }
  if (usage.starters > 0) {
    lines.push(
      `${plural(usage.starters, "GRIDGO starter is", "GRIDGO starters are")} seeded for it.`,
    );
  }
  if ((usage.aliases ?? 0) > 0) {
    lines.push(`${plural(usage.aliases ?? 0, "legacy code")} still points here.`);
  }
  return lines;
}

/**
 * Turns the API's refusal into what the editor says. Anything that is not one
 * of the two expected 409s returns null so the page can fall back to the
 * general admin error copy.
 */
export function describeDeleteRefusal(
  err: unknown,
  kind: DangerEntryKind,
): DeleteRefusal | null {
  if (!isApiError(err) || err.status !== 409) return null;
  const canRetire = err.detail<boolean>("canRetire") !== false;
  if (err.code === "catalog_entry_shipped") {
    return {
      reason: "shipped",
      title: "Cannot delete: it ships with GRIDGO",
      lines: [
        `This ${kind} is part of the chart every GRIDGO build seeds, so it would come back on the next deploy.`,
        canRetire
          ? "Hide it from new listings instead. Existing listings and history stay as they are."
          : "It is already hidden from new listings.",
      ],
      canRetire,
    };
  }
  if (err.code === "catalog_entry_in_use") {
    const usage = err.detail<CatalogEntryUsage>("usage");
    const lines = usage ? usageLines(usage, kind) : [];
    if (canRetire) {
      lines.push("Hide it from new listings instead. Nothing already filed is touched.");
    } else {
      lines.push("It is already hidden from new listings.");
    }
    return {
      reason: "in_use",
      title: "Cannot delete while in use",
      lines,
      canRetire,
    };
  }
  return null;
}

/** The typed confirmation must be the code itself — no case or whitespace leniency beyond trimming. */
export function confirmationMatches(typed: string, code: string): boolean {
  return typed.trim() === code && code.length > 0;
}
