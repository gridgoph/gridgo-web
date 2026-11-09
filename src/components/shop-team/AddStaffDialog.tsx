"use client";

import { Link2, Mail, QrCode } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { InviteLink, InviteQr } from "@/components/shop-team/InviteShare";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isApiError } from "@/lib/api/client";
import { createShopInvite } from "@/lib/api/shop-team";
import type { ShopInvite } from "@/lib/api/types";
import {
  inviteExpiresIn,
  joinTeamUrl,
  parseInviteIdentity,
  shopTeamErrorCopy,
} from "@/lib/shop-team";

export type AddStaffMethod = "contact" | "qr" | "link";

type Created = { method: AddStaffMethod; invite: ShopInvite; url: string };

/**
 * Add staff three ways. GRIDGO sends no email or text: every invite is a
 * one-time link (48 hours) the Owner passes on, shown here once because the
 * API returns its token only at creation. An email or phone invite also
 * waits for that person when they sign in with it.
 */
export function AddStaffDialog({
  open,
  onOpenChange,
  shopName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shopName?: string | null;
  onCreated: () => void;
}) {
  const id = useId();
  const [method, setMethod] = useState<AddStaffMethod>("contact");
  const [contact, setContact] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  // Each opening starts clean; a token is never kept past its dialog.
  useEffect(() => {
    if (!open) {
      setContact("");
      setInputError(null);
      setError(null);
      setCreated(null);
      setMethod("contact");
    }
  }, [open]);

  async function create(kind: "email" | "phone" | "qr" | "link", identity?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await createShopInvite(kind, identity);
      setCreated({
        method,
        invite: result.invite,
        url: joinTeamUrl(window.location.origin, result.token),
      });
      onCreated();
    } catch (caught) {
      setError(shopTeamErrorCopy(isApiError(caught) ? caught.code : null));
    } finally {
      setBusy(false);
    }
  }

  function submitContact() {
    const parsed = parseInviteIdentity(contact);
    if (!parsed) {
      setInputError("Enter an email or a mobile number.");
      return;
    }
    setInputError(null);
    void create(parsed.kind, parsed.identity);
  }

  const shown = created && created.method === method ? created : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>Staff can take and make orders. Nothing else.</DialogDescription>
        </DialogHeader>
        <Tabs
          value={method}
          onValueChange={(value) => {
            setMethod(value as AddStaffMethod);
            setError(null);
          }}
          className="gap-4"
        >
          <TabsList aria-label="How to invite" className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="contact" className="min-h-11 gap-1.5">
              <Mail aria-hidden />
              Email or phone
            </TabsTrigger>
            <TabsTrigger value="qr" className="min-h-11 gap-1.5">
              <QrCode aria-hidden />
              QR code
            </TabsTrigger>
            <TabsTrigger value="link" className="min-h-11 gap-1.5">
              <Link2 aria-hidden />
              Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contact" className="flex flex-col gap-3">
            {shown ? (
              <>
                <InviteReady invite={shown.invite} />
                <p className="text-body text-text-secondary m-0">
                  They&rsquo;ll see it when they sign in with{" "}
                  <span className="text-text-primary">{shown.invite.identity}</span>. Or send
                  them this link:
                </p>
                <InviteLink url={shown.url} shopName={shopName} />
                <Button variant="ghost" className="self-start" onClick={() => setCreated(null)}>
                  Invite someone else
                </Button>
              </>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitContact();
                }}
              >
                <Field data-invalid={inputError ? true : undefined}>
                  <FieldLabel htmlFor={`${id}-contact`}>Their email or mobile number</FieldLabel>
                  <Input
                    id={`${id}-contact`}
                    value={contact}
                    autoComplete="off"
                    inputMode="email"
                    placeholder="sam@example.com or 0917 123 4567"
                    aria-invalid={inputError ? true : undefined}
                    disabled={busy}
                    onChange={(event) => {
                      setContact(event.target.value);
                      setInputError(null);
                    }}
                  />
                  {inputError ? <FieldError>{inputError}</FieldError> : null}
                </Field>
                <Button type="submit" variant="primary" disabled={busy || !contact.trim()}>
                  {busy ? "Creating…" : "Create invite"}
                </Button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="qr" className="flex flex-col gap-3">
            {shown ? (
              <>
                <InviteQr url={shown.url} />
                <p className="text-body text-text-secondary m-0 text-center">
                  Scan with the GRIDGO Supplier app or a phone camera.
                </p>
                <InviteReady invite={shown.invite} centered />
              </>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => void create("qr")}>
                {busy ? "Creating…" : "Show QR code"}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="link" className="flex flex-col gap-3">
            {shown ? (
              <>
                <InviteLink url={shown.url} shopName={shopName} />
                <InviteReady invite={shown.invite} />
              </>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => void create("link")}>
                {busy ? "Creating…" : "Create link"}
              </Button>
            )}
          </TabsContent>
        </Tabs>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InviteReady({ invite, centered = false }: { invite: ShopInvite; centered?: boolean }) {
  return (
    <p
      className={`text-caption text-text-muted m-0${centered ? " text-center" : ""}`}
      role="status"
    >
      Works once · {inviteExpiresIn(invite.expiresAt).toLowerCase()}
    </p>
  );
}
