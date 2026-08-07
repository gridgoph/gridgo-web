import type { ReactNode } from "react";

type Props = {
  title?: string;
  body: string;
  action?: ReactNode;
};

/** Errors explain the fix and never apologise. */
export function ErrorState({
  title = "Could not load this screen",
  body,
  action,
}: Props) {
  return (
    <div
      className="gg-card flex flex-col items-start gap-3 border-error"
      role="alert"
    >
      <h2 className="text-h3 text-text-primary m-0">{title}</h2>
      <p className="text-body text-text-secondary m-0 max-w-prose">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
