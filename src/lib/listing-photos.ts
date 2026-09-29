/**
 * A listing's sample photos, as the shop manages them on the web editor.
 *
 * The first photo is the wide sample — the one a client sees first on the
 * board and in the client app. Every change is one of two API calls
 * (contract: gridgo-api docs/SUPPLIER_CATALOG_API.md):
 *
 * - `POST /me/catalog-items/:id/photos/reorder` with the ids that stay, in
 *   board order. Remove, move and "make wide sample" are all this call. A
 *   shorter list only detaches the missing photos from the listing; the
 *   stored file is not deleted. Order line snapshots never carry listing
 *   photos, so no order loses a file this way.
 * - `POST /files/:id/attach` at an existing `sortOrder`. The API swaps the
 *   photo in that slot in place (detaching the old one), which is Replace.
 *
 * Never call file DELETE from here.
 */

export type PhotoAction = "remove" | "replace" | "make-first" | "earlier" | "later";

/** Plain name for the photo at `index`: "wide sample", then "photo 2", "photo 3"… */
export function photoName(index: number): string {
  return index === 0 ? "wide sample" : `photo ${index + 1}`;
}

/** `photoName` for the start of a sentence or a label. */
export function photoTitle(index: number): string {
  const name = photoName(index);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The ids that stay, in order, once `fileId` comes off the listing. */
export function orderWithout(ids: readonly string[], fileId: string): string[] {
  return ids.filter((id) => id !== fileId);
}

/** `fileId` first, the rest in their current order. */
export function orderWithFirst(ids: readonly string[], fileId: string): string[] {
  if (!ids.includes(fileId)) return [...ids];
  return [fileId, ...ids.filter((id) => id !== fileId)];
}

/** `fileId` one place earlier (-1) or later (1); unchanged at either end. */
export function orderMoved(
  ids: readonly string[],
  fileId: string,
  direction: -1 | 1,
): string[] {
  const index = ids.indexOf(fileId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/** Which actions make sense for the photo at `index` of `count`. */
export function actionsFor(index: number, count: number): PhotoAction[] {
  const actions: PhotoAction[] = [];
  if (index > 0) actions.push("make-first");
  if (index > 0) actions.push("earlier");
  if (index < count - 1) actions.push("later");
  actions.push("replace", "remove");
  return actions;
}

export type RemovalCopy = { title: string; body: string; action: string };

/**
 * What the confirm says before a photo comes off. It names the photo, what
 * takes its place, and (for the last one) that the listing leaves the board.
 */
export function removalCopy(index: number, count: number): RemovalCopy {
  const action = "Remove photo";
  if (count <= 1) {
    return {
      title: "Remove the only photo?",
      body: "It comes off this listing. A listing needs a photo to be on the board, so clients stop seeing it until you add another.",
      action,
    };
  }
  if (index === 0) {
    return {
      title: "Remove the wide sample?",
      body: "It comes off this listing. Photo 2 becomes the wide sample clients see first.",
      action,
    };
  }
  return {
    title: `Remove ${photoName(index)}?`,
    body: "It comes off this listing. The other photos keep their order.",
    action,
  };
}

/** Orders already placed never read listing photos; say so once in the confirm. */
export const REMOVAL_ORDERS_NOTE = "Orders already placed are not changed.";

/**
 * The sentence the page shows after a change, so a shop can see what moved.
 * `before` is the id order sent from; `after` is what the API kept.
 */
export function changeNotice(
  action: Exclude<PhotoAction, "replace">,
  fileId: string,
  before: readonly string[],
  after: readonly string[],
): string {
  const from = before.indexOf(fileId);
  if (action === "remove") {
    if (after.length === 0)
      return "Photo removed. Add a photo to put this listing on the board.";
    if (from === 0) return "Wide sample removed. The next photo is now the wide sample.";
    return `${photoTitle(from)} removed.`;
  }
  const to = after.indexOf(fileId);
  if (to === 0) return `${photoTitle(from)} is now the wide sample.`;
  return `${photoTitle(from)} is now ${photoName(to)}.`;
}

/** After replacing the photo at `index`. */
export function replacedNotice(index: number): string {
  return `${photoTitle(index)} replaced. It kept its place.`;
}
