"use client";

import Link from "next/link";
import { MessageSquare, Phone } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { telHref } from "@/lib/rider-tracking";
import { cn } from "@/lib/utils";

// Merged like <Button> does, so the outline border survives the base reset.
const linkButton = cn(buttonVariants({ size: "sm" }));

type Props = {
  riderId: string;
  name: string;
  /** From the rider directory; null or empty when none is on file. */
  phone: string | null | undefined;
  /** Which tree's chat desk Message opens. */
  tree: "ops" | "admin";
};

/** Where "Message" lands: the chat desk, opened on this rider's thread. */
export function riderChatHref(tree: "ops" | "admin", riderId: string): string {
  return `/${tree}/chat?with=${encodeURIComponent(riderId)}&role=rider`;
}

/**
 * Call and Message for one rider. Call dials the phone number on the rider's
 * account from this device; without one it says so instead of offering a
 * button that goes nowhere. Message opens the chat desk on the rider's thread.
 */
export function RiderContact({ riderId, name, phone, tree }: Props) {
  const tel = telHref(phone);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tel ? (
        <a
          href={tel}
          className={linkButton}
          aria-label={`Call ${name} on ${phone}`}
        >
          <Phone size={16} aria-hidden />
          Call
        </a>
      ) : null}
      <Link
        href={riderChatHref(tree, riderId)}
        className={linkButton}
        aria-label={`Message ${name}`}
      >
        <MessageSquare size={16} aria-hidden />
        Message
      </Link>
      {tel ? (
        <span className="text-caption text-text-muted tabular-nums">{phone}</span>
      ) : (
        <span className="text-caption text-text-muted">No phone number on file</span>
      )}
    </div>
  );
}
