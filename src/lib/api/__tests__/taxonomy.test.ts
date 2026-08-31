import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CLIENT = join(process.cwd(), "src/lib/api/client.ts");
const TYPES = join(process.cwd(), "src/lib/api/types.ts");

describe("taxonomy client contract", () => {
  it("writes print jobs through /taxonomy/subcategories", () => {
    const src = readFileSync(CLIENT, "utf8");
    expect(src).toMatch(/export async function createTaxonomySubcategory/);
    expect(src).toMatch(/export async function updateTaxonomySubcategory/);
    expect(src).toMatch(/["'`]\/taxonomy\/subcategories["'`]/);
    expect(src).toMatch(/bestFor\?: string/);
  });

  it("types the live chart fields Super Admin edits", () => {
    const src = readFileSync(TYPES, "utf8");
    expect(src).toMatch(/bestFor\?: string/);
    expect(src).toMatch(/examples\?: string\[\]/);
    expect(src).toMatch(/export type TaxonomyCategoryAlias/);
    expect(src).toMatch(/categoryAliases\?: TaxonomyCategoryAlias\[\]/);
  });
});
