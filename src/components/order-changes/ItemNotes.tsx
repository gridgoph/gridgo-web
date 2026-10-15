import type { ItemInstructions } from "@/lib/order-changes";
import { formatDateTime } from "@/lib/format";

type Props = {
  notes: ItemInstructions[];
  /** "Your change" on the shop's job, "Agreed change" for the GRIDGO Team. */
  agreedLabel?: string;
};

/**
 * The client's own words about each item, set apart from the options picked
 * from a list.
 *
 * Each note hangs off a warning-coloured rule, the way a slip is clipped to a
 * job ticket: it is the one part of the order nobody chose from a list, so it
 * is the part a reader skims past unless the page stops them. Contact details
 * arrive already masked by GRIDGO and are shown exactly as stored.
 */
export function ItemNotes({ notes, agreedLabel = "Agreed change" }: Props) {
  const named = notes.length > 1 || notes.some((note) => note.lineItemId);
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {notes.map((note, index) => (
        <li key={note.lineItemId || index} className="flex gap-3">
          <span className="w-1 shrink-0 rounded-pill bg-warning" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
            {named ? (
              <span className="text-caption text-text-muted">
                {notes.length > 1 ? `Item ${index + 1} · ${note.itemName}` : note.itemName}
              </span>
            ) : null}
            {note.text ? (
              <p className="text-body-lg text-text-primary m-0 whitespace-pre-line break-words">
                {note.text}
              </p>
            ) : (
              <p className="text-body text-text-muted m-0">No note on this item.</p>
            )}
            {note.agreedChange ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-caption text-text-muted">
                  {agreedLabel}
                  {note.agreedAt ? `, agreed ${formatDateTime(note.agreedAt)}` : ""}
                </span>
                <p
                  className="text-body text-text-primary m-0 break-words"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {note.agreedChange}
                </p>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
