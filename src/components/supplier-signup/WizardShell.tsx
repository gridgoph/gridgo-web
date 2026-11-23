"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/ui/Logo";
import { useSupplierDesktop } from "@/lib/useSupplierDesktop";
import { cn } from "@/lib/utils";

/**
 * The sign-up wizard's two layouts (gridgoph/gridgo-web#328).
 *
 * At 1280px and wider the step list stays on the left and the open step sits
 * on the right, so a shop at the counter PC always sees how far it is. Below
 * that it is the shop app's layout: the step list is its own screen, and a
 * step opens over it with a way back. Same steps, same rules; only the
 * layout changes.
 *
 * `standalone` draws its own page (before the shop exists there is no portal
 * shell yet); `embedded` sits inside the supplier shell after the shop opens.
 */
export function WizardShell({
  heading,
  lede,
  rail,
  step,
  onShowSteps,
  footer,
  standalone = false,
  headerEnd,
  centered,
  idle,
}: {
  heading: string;
  lede: string;
  rail: ReactNode;
  /** The open step's content; null shows the step list alone below 1280px. */
  step: ReactNode | null;
  /** Below 1280px: close the step and return to the list. */
  onShowSteps?: () => void;
  /** Below 1280px with no step open: the list's own action. */
  footer?: ReactNode;
  standalone?: boolean;
  headerEnd?: ReactNode;
  /** One centred column instead of the step list (step 0, the account, notices). */
  centered?: ReactNode;
  /** At 1280px and wider with no step open: what the right-hand pane shows. */
  idle?: ReactNode;
}) {
  const desktop = useSupplierDesktop();

  const intro = (
    <div className="flex flex-col gap-2">
      {standalone ? (
        <h1 className="text-h1 m-0 text-text-primary">{heading}</h1>
      ) : (
        <h2 className="text-h1 m-0 text-text-primary">{heading}</h2>
      )}
      <p className="text-body-lg m-0 text-text-secondary">{lede}</p>
    </div>
  );

  const body = centered ? (
    <div className="mx-auto w-full max-w-2xl rounded-card border border-outline bg-surface p-5 md:p-8">
      {centered}
    </div>
  ) : desktop ? (
    <div
      className="grid w-full grid-cols-[22rem_minmax(0,1fr)] items-start gap-8"
      data-testid="wizard-desktop"
    >
      <aside className="sticky top-4 flex flex-col gap-6 rounded-card border border-outline bg-surface p-5">
        {intro}
        {rail}
      </aside>
      <div className="min-w-0 rounded-card border border-outline bg-surface p-8">
        <div className="mx-auto w-full max-w-2xl">{step ?? idle ?? footer}</div>
      </div>
    </div>
  ) : step ? (
    <div className="flex w-full flex-col gap-4" data-testid="wizard-phone-step">
      {onShowSteps ? (
        <button
          type="button"
          onClick={onShowSteps}
          className="text-body flex min-h-11 items-center gap-2 self-start text-text-secondary underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          All steps
        </button>
      ) : null}
      {step}
    </div>
  ) : (
    <div className="flex w-full flex-col gap-6" data-testid="wizard-phone-map">
      {intro}
      {rail}
      {footer}
    </div>
  );

  if (!standalone) return <div className="mx-auto w-full max-w-7xl">{body}</div>;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-outline-subtle bg-surface px-4">
        <Logo />
        {headerEnd}
      </header>
      <main
        id="main-content"
        className={cn("mx-auto flex w-full flex-col p-4", desktop ? "max-w-7xl py-8" : "max-w-xl")}
      >
        {body}
      </main>
    </div>
  );
}
