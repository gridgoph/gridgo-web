import { describe, expect, it } from "vitest";

import type { Order, ProductionItem } from "@/lib/api/types";
import {
  artworkQaCheckLabel,
  artworkSource,
  DESIGN_LINK_ONLY_COPY,
  lineArtworkLinks,
  linkDisplay,
  linkDisplayParts,
  orderDesignLinks,
  providerName,
  providerOf,
  safeLinkHref,
} from "@/lib/design-links";

function line(partial: Partial<ProductionItem> = {}): ProductionItem {
  return {
    id: "line1",
    itemName: "Flyers",
    quantity: 100,
    measurement: null,
    ...partial,
  };
}

function order(partial: Partial<Pick<Order, "artworkFileIds" | "productionItems">>) {
  return { artworkFileIds: [], productionItems: [], ...partial };
}

describe("providerOf", () => {
  it.each([
    ["https://www.canva.com/design/DAF1/view", "canva"],
    ["https://canva.link/abc", "canva"],
    ["https://drive.google.com/file/d/ABC/view", "google_drive"],
    ["https://docs.google.com/presentation/d/ABC", "google_drive"],
    ["https://www.dropbox.com/s/abc/flyer.pdf", "dropbox"],
    ["https://dl.dropboxusercontent.com/s/abc", "dropbox"],
    ["https://we.tl/t-abc", "we_transfer"],
    ["https://wetransfer.com/downloads/abc", "we_transfer"],
    ["https://www.figma.com/file/abc", "figma"],
    ["https://example.com/flyer.pdf", "other"],
  ] as const)("reads %s as %s", (url, provider) => {
    expect(providerOf(url)).toBe(provider);
  });

  it("does not trust a lookalike domain", () => {
    expect(providerOf("https://canva.com.evil.example/design/x")).toBe("other");
    expect(providerOf("https://notdropbox.com/x")).toBe("other");
  });

  it("names every provider the way the client app does", () => {
    expect(providerName("google_drive")).toBe("Google Drive");
    expect(providerName("we_transfer")).toBe("WeTransfer");
    expect(providerName("other")).toBe("Web link");
  });
});

describe("link display", () => {
  it("drops scheme, www, query and fragment", () => {
    expect(linkDisplay("https://www.canva.com/design/DAF1/view?utm_source=share#x")).toBe(
      "canva.com/design/DAF1/view",
    );
  });

  it("keeps the end of a long address, where the design id is", () => {
    const { head, tail } = linkDisplayParts(
      "https://www.canva.com/design/DAGabcdefghijk/XYZ123token/view",
    );
    expect(head + tail).toBe("canva.com/design/DAGabcdefghijk/XYZ123token/view");
    expect(tail).toBe("XYZ123token/view".slice(-14));
  });

  it("does not split a short address", () => {
    expect(linkDisplayParts("https://we.tl/t-abc")).toEqual({ head: "we.tl/t-abc", tail: "" });
  });
});

describe("safeLinkHref", () => {
  it("allows only HTTPS", () => {
    expect(safeLinkHref("https://www.canva.com/design/x")).toBe("https://www.canva.com/design/x");
    expect(safeLinkHref("http://example.com")).toBeNull();
    expect(safeLinkHref("javascript:alert(1)")).toBeNull();
    expect(safeLinkHref("not a url")).toBeNull();
  });
});

describe("order links", () => {
  it("reads nothing from an API without the field", () => {
    expect(lineArtworkLinks(line())).toEqual([]);
    expect(orderDesignLinks(order({ productionItems: [line()] }))).toEqual([]);
    expect(orderDesignLinks({})).toEqual([]);
  });

  it("collects links across lines, once each, naming the line only when there are several", () => {
    const canva = { formatCode: "canva_link", url: "https://www.canva.com/design/A/view" };
    const drive = { formatCode: "other_link", url: "https://drive.google.com/file/d/B/view" };
    const single = orderDesignLinks(order({ productionItems: [line({ artworkLinks: [canva] })] }));
    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({ provider: "canva", lineName: null });

    const many = orderDesignLinks(
      order({
        productionItems: [
          line({ id: "l1", itemName: "Flyers", artworkLinks: [canva, drive] }),
          line({ id: "l2", itemName: "Banner", artworkLinks: [canva] }),
        ],
      }),
    );
    expect(many.map((link) => [link.provider, link.lineName])).toEqual([
      ["canva", "Flyers"],
      // An older client filed a Drive link as `other_link`; the host decides.
      ["google_drive", "Flyers"],
    ]);
  });
});

describe("artworkSource", () => {
  const link = { formatCode: "canva_link", url: "https://www.canva.com/design/A/view" };

  it("tells a link-only order apart from one with nothing", () => {
    expect(artworkSource(order({}))).toBe("none");
    expect(artworkSource(order({ productionItems: [line({ artworkLinks: [link] })] }))).toBe(
      "link",
    );
    expect(artworkSource(order({ artworkFileIds: ["f1"] }))).toBe("file");
    expect(
      artworkSource(
        order({ artworkFileIds: ["f1"], productionItems: [line({ artworkLinks: [link] })] }),
      ),
    ).toBe("file_and_link");
  });

  it("words the QA tick for what there is to check", () => {
    expect(artworkQaCheckLabel("file")).toBe("Artwork opens and is high enough resolution");
    expect(artworkQaCheckLabel("link")).toMatch(/^Design link opens without signing in/);
    expect(artworkQaCheckLabel("file_and_link")).toMatch(/design link matches it/);
  });

  it("never calls a link-only order empty", () => {
    expect(DESIGN_LINK_ONLY_COPY).toBe("Design link: open it to get the file");
    expect(DESIGN_LINK_ONLY_COPY).not.toMatch(/no artwork/i);
  });
});
