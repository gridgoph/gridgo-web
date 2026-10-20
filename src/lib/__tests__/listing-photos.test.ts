import { describe, expect, it } from "vitest";

import {
  actionsFor,
  changeNotice,
  orderMoved,
  orderWithFirst,
  orderWithout,
  photoName,
  removalCopy,
  replacedNotice,
} from "@/lib/listing-photos";

const ids = ["a", "b", "c"];

describe("listing photo order", () => {
  it("names the first photo the Board photo and counts the rest from 2", () => {
    expect([0, 1, 2].map(photoName)).toEqual(["Board photo", "photo 2", "photo 3"]);
  });

  it("drops one id and keeps the rest in order", () => {
    expect(orderWithout(ids, "a")).toEqual(["b", "c"]);
    expect(orderWithout(ids, "b")).toEqual(["a", "c"]);
    expect(orderWithout(["a"], "a")).toEqual([]);
  });

  it("puts a photo first without reshuffling the others", () => {
    expect(orderWithFirst(ids, "c")).toEqual(["c", "a", "b"]);
    expect(orderWithFirst(ids, "a")).toEqual(ids);
    expect(orderWithFirst(ids, "zzz")).toEqual(ids);
  });

  it("moves one place and stops at either end", () => {
    expect(orderMoved(ids, "b", -1)).toEqual(["b", "a", "c"]);
    expect(orderMoved(ids, "b", 1)).toEqual(["a", "c", "b"]);
    expect(orderMoved(ids, "a", -1)).toEqual(ids);
    expect(orderMoved(ids, "c", 1)).toEqual(ids);
  });

  it("offers make-first and moves only where they change something", () => {
    expect(actionsFor(0, 3)).toEqual(["later", "replace", "remove"]);
    expect(actionsFor(1, 3)).toEqual([
      "make-first",
      "earlier",
      "later",
      "replace",
      "remove",
    ]);
    expect(actionsFor(2, 3)).toEqual(["make-first", "earlier", "replace", "remove"]);
    expect(actionsFor(0, 1)).toEqual(["replace", "remove"]);
  });
});

describe("listing photo copy", () => {
  it("says what replaces a removed Board photo, and warns on the only photo", () => {
    expect(removalCopy(0, 3).body).toContain("Photo 2 becomes the Board photo");
    expect(removalCopy(2, 3).title).toBe("Remove photo 3?");
    expect(removalCopy(0, 1).body).toContain("clients stop seeing it");
  });

  it("tells the shop what moved", () => {
    expect(changeNotice("remove", "a", ids, ["b", "c"])).toBe(
      "Board photo removed. The next photo is now the Board photo.",
    );
    expect(changeNotice("remove", "b", ids, ["a", "c"])).toBe("Photo 2 removed.");
    expect(changeNotice("remove", "a", ["a"], [])).toMatch(/Add a photo/);
    expect(changeNotice("make-first", "c", ids, ["c", "a", "b"])).toBe(
      "Photo 3 is now the Board photo.",
    );
    expect(changeNotice("later", "a", ids, ["b", "a", "c"])).toBe(
      "Board photo is now photo 2.",
    );
    expect(replacedNotice(1)).toBe("Photo 2 replaced. It kept its place.");
  });
});
