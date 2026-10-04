import { Fragment, type ReactNode } from "react";

import {
  type MarkdownInline,
  parseInline,
  parseMarkdownBlocks,
} from "@/app/admin/_lib/tracker-decision";
import { cn } from "@/lib/utils";

function renderInline(nodes: readonly MarkdownInline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case "strong":
        return (
          <strong key={index} className="text-text-primary" style={{ fontFamily: "var(--font-bold)" }}>
            {renderInline(node.children)}
          </strong>
        );
      case "em":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "code":
        return (
          <code key={index} className="rounded-sm bg-surface-variant px-1 break-words">
            {node.text}
          </code>
        );
      default:
        return <Fragment key={index}>{node.text}</Fragment>;
    }
  });
}

/** One line of issue text with its bold, italic and code marks; never raw HTML. */
export function TrackerInline({ text }: { text: string }) {
  return <>{renderInline(parseInline(text))}</>;
}

/**
 * Read-only issue markdown (paragraphs, lists, bold, italic, code), built as
 * React elements so nothing in an issue body can inject markup.
 */
export function TrackerMarkdown({
  markdown,
  className,
  id,
}: {
  markdown: string;
  className?: string;
  id?: string;
}) {
  const blocks = parseMarkdownBlocks(markdown);
  return (
    // Joined, not cn()-merged: tailwind-merge reads `text-caption` as a colour
    // and would drop it beside the caller's text colour.
    <div id={id} className={["flex min-w-0 flex-col gap-2 break-words", className].filter(Boolean).join(" ")}>
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className="m-0">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        ) : (
          <List key={index} ordered={block.ordered}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </List>
        ),
      )}
    </div>
  );
}

function List({ ordered, children }: { ordered: boolean; children: ReactNode }) {
  const className = cn("m-0 flex flex-col gap-1 pl-5", ordered ? "list-decimal" : "list-disc");
  return ordered ? <ol className={className}>{children}</ol> : <ul className={className}>{children}</ul>;
}
