import { LOCK_SCREEN_BUDGET } from "@/app/admin/_lib/broadcasts";

type Props = {
  title: string;
  body: string;
};

/**
 * What a handset shows, at a handset's width.
 *
 * The truncation here is real CSS truncation in a box the width of a phone's
 * notification, not an illustration of one — a sentence that reads well in a
 * wide textarea is cut mid-word here, and that is the whole point of showing
 * it. Deliberately no wallpaper, clock or app icon: they would be decoration
 * that changes nothing about where the cut lands.
 */
export function LockScreenPreview({ title, body }: Props) {
  const shownTitle = title.trim();
  const shownBody = body.trim();

  const titleTight = shownTitle.length > LOCK_SCREEN_BUDGET.title;
  const bodyTight = shownBody.length > LOCK_SCREEN_BUDGET.body;

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full max-w-[22.5rem] rounded-lg border border-outline bg-surface-variant p-3">
        <p className="text-overline text-text-muted m-0 uppercase">GRIDGO</p>
        <p
          className="text-body text-text-primary m-0 mt-1.5 truncate"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {shownTitle || "Your title lands here"}
        </p>
        <p className="text-body text-text-secondary m-0 mt-0.5 line-clamp-2">
          {shownBody ||
            "Your message lands here. Two lines of it, before the phone stops."}
        </p>
      </div>

      <p className="text-caption text-text-muted m-0 max-w-[22.5rem]">
        {titleTight || bodyTight
          ? `${titleTight ? "The title" : "The message"}${
              titleTight && bodyTight ? " and the message are" : " is"
            } longer than a locked phone shows. The rest only appears when someone opens the notification.`
          : "This is roughly all a locked phone shows. Android shows less of the message than iPhone does."}
      </p>
    </div>
  );
}
