import {
  CircleCheck,
  CircleX,
  Clock,
  SquarePen,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { StatusIconName, StatusTone } from "@/lib/order-state";

const ICONS: Record<StatusIconName, LucideIcon> = {
  "circle-check": CircleCheck,
  "triangle-alert": TriangleAlert,
  "circle-x": CircleX,
  clock: Clock,
  "square-pen": SquarePen,
};

const TONE: Record<
  StatusTone,
  { border: string; text: string; icon: string }
> = {
  success: {
    border: "border-success",
    text: "text-success",
    icon: "var(--color-success)",
  },
  warning: {
    border: "border-warning",
    text: "text-warning",
    icon: "var(--color-warning)",
  },
  error: {
    border: "border-error",
    text: "text-error",
    icon: "var(--color-error)",
  },
  info: {
    border: "border-info",
    text: "text-info",
    icon: "var(--color-info)",
  },
  neutral: {
    border: "border-outline",
    text: "text-text-secondary",
    icon: "var(--color-text-secondary)",
  },
};

type Props = {
  tone: StatusTone;
  label: string;
  icon: StatusIconName;
};

/**
 * Colour never carries meaning alone. Status is always icon + label + colour.
 */
export function StatusChip({ tone, label, icon }: Props) {
  const style = TONE[tone];
  const Icon = ICONS[icon];

  return (
    <span className={`gg-chip ${style.border}`} role="status">
      <Icon
        size={13}
        strokeWidth={2}
        aria-hidden
        style={{ color: style.icon }}
      />
      <span className={`text-caption ${style.text}`}>{label}</span>
    </span>
  );
}
