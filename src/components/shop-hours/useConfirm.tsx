"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmRequest = {
  /** The question, naming the thing: "Remove the closure on Thu, 24 Dec 2026?" */
  title: string;
  /** What happens if they go ahead. */
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
};

/**
 * One confirmation at a time, asked and awaited: `if (!(await ask({...}))) return;`.
 * Every shop-hours change that cannot be quietly undone asks first, saying
 * what changes, as the shop app does.
 */
export function useConfirm(): { ask: (request: ConfirmRequest) => Promise<boolean>; dialog: ReactNode } {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const settle = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setRequest(null);
  }, []);

  const ask = useCallback((next: ConfirmRequest) => {
    resolver.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const dialog = (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" onClick={() => settle(false)}>
            {request?.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={request?.destructive ? "danger" : "secondary"}
            onClick={() => settle(true)}
          >
            {request?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { ask, dialog };
}

/** "Now", ticking, so the open/closed line and the extension's choices follow the clock. */
export function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
