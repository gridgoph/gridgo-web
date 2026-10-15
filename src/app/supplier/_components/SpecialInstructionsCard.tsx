import { CircleCheck, MessageSquareText, TriangleAlert } from "lucide-react";

import { ItemNotes } from "@/components/order-changes/ItemNotes";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { ItemInstructions } from "@/lib/order-changes";

type Props = {
  notes: ItemInstructions[];
  /** When this shop ticked that it read them; null while it has not. */
  readAt: string | null;
  /** True while the job is still an offer, so the tick comes with accepting. */
  offer: boolean;
  /** Opens the change request, when one can be asked for. */
  onRequestChange?: () => void;
};

/**
 * The client's special instructions on the shop's job, from the offer until
 * the job is done. The tick is said underneath in words and an icon, never by
 * colour alone.
 */
export function SpecialInstructionsCard({ notes, readAt, offer, onRequestChange }: Props) {
  return (
    <section
      className="gg-card flex flex-col gap-4 p-3"
      aria-labelledby="special-instructions-heading"
      data-testid="special-instructions"
    >
      <div className="flex items-start gap-2">
        <MessageSquareText
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-warning"
          aria-hidden
        />
        <div className="min-w-0">
          <h3 id="special-instructions-heading" className="text-h3 text-text-primary m-0">
            Special instructions
          </h3>
          <p className="text-caption text-text-muted m-0 mt-0.5">
            The client wrote these for this job. They do not change the price.
          </p>
        </div>
      </div>

      <ItemNotes notes={notes} agreedLabel="Agreed change" />

      {readAt ? (
        <p className="text-body text-success m-0 flex items-center gap-2">
          <CircleCheck size={16} strokeWidth={2} className="shrink-0" aria-hidden />
          Read and ticked {formatDateTime(readAt)}
        </p>
      ) : offer ? (
        <p className="text-body text-warning m-0 flex items-center gap-2">
          <TriangleAlert size={16} strokeWidth={2} className="shrink-0" aria-hidden />
          You tick that you read these when you accept.
        </p>
      ) : null}

      {onRequestChange ? (
        <div>
          <Button variant="secondary" onClick={onRequestChange}>
            Costs more? Request a change
          </Button>
        </div>
      ) : null}
    </section>
  );
}
