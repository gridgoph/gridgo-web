import { expect, it } from "vitest";

import { sectionNumber } from "@/app/supplier/_components/editor-sections";

const steps = [["kind"], ["photos", "what"], ["prep", "artwork", "layouts"]];

it("numbers a lone section as its step and several in order, never the same twice", () => {
  expect(sectionNumber(steps, "kind")).toBe("01");
  expect(sectionNumber(steps, "what")).toBe("02.2");
  expect(["prep", "artwork", "layouts"].map((id) => sectionNumber(steps, id))).toEqual([
    "03.1",
    "03.2",
    "03.3",
  ]);
  expect(sectionNumber(steps, "missing")).toBe("");
});
