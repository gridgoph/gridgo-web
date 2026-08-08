import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
};

/** Empty screens invite the next action — never a shrug. */
export function EmptyState({ title, body, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-card border border-outline bg-surface p-4",
        className,
      )}
    >
      <h2 className="text-h3 text-text-primary m-0">{title}</h2>
      <p className="text-body text-text-secondary m-0 max-w-prose">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
