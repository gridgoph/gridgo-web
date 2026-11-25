"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";

import { BudgetMeter } from "@/components/organization-partners/BudgetMeter";
import { PartnerForm } from "@/components/organization-partners/PartnerForm";
import { PerkPreview } from "@/components/organization-partners/PerkPreview";
import { ReasonDialog } from "@/components/organization-partners/ReasonDialog";
import {
  PartnerLoadError,
  StaleFigures,
} from "@/components/organization-partners/states";
import { usePartnerData } from "@/components/organization-partners/usePartnerData";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { toast } from "@/components/ui/toast";
import { getOrganization, isApiError } from "@/lib/api/client";
import {
  getOrganizationPartner,
  getStandardPerk,
  removePartnerPerk,
  saveOrganizationPartner,
  type MemberPerk,
  type OrganizationPartner,
} from "@/lib/api/organization-partners";
import type { OrganizationAccount } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  BENEFITS,
  NEW_ORDERS_NOTE,
  PERK_CHIP,
  budgetNeedsAttention,
  budgetWarning,
  canBePartner,
  dayWords,
  memberLabel,
  partnerBudget,
  partnerChip,
  partnerErrorText,
  partnerInput,
  partnerDraft,
  perkReaches,
  perkSetting,
  perkState,
} from "@/lib/organization-partners";

type Tree = "ops" | "admin";
type Data = {
  partner: OrganizationPartner | null;
  standard: MemberPerk | null;
  /** Read only when the organization is not a partner. */
  organization: OrganizationAccount | null;
};

/**
 * One organization's partnership: its perk, budget and totals. Super Admin
 * changes it, ends it or starts it again; Operations reads it. An
 * organization that was never a partner opens on the form that makes it one.
 */
export function PartnerDetail({
  tree,
  userId,
  history,
}: {
  tree: Tree;
  userId: string;
  history?: ReactNode;
}) {
  const read = useCallback(async (): Promise<Data> => {
    const [partner, standard] = await Promise.all([
      getOrganizationPartner(userId).catch((err: unknown) => {
        if (isApiError(err) && err.code === "organization_partner_not_found") return null;
        throw err;
      }),
      getStandardPerk(),
    ]);
    return {
      partner,
      standard,
      organization: partner ? null : await getOrganization(userId),
    };
  }, [userId]);
  const { data, loadError, refreshError, load, put, retry } = usePartnerData(read);
  const [notice, setNotice] = useState<string | null>(null);

  const listHref = `/${tree}/partner-organizations`;

  if (!data) {
    if (isApiError(loadError) && loadError.code === "organization_not_found") {
      return (
        <ErrorState
          title="Organization not found"
          body="There is no organization account with this id. The link may be wrong."
          action={
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href={listHref} />}
            >
              All partner organizations
            </Button>
          }
        />
      );
    }
    return loadError ? (
      <PartnerLoadError error={loadError} onRetry={retry} />
    ) : (
      <SkeletonDetail label="Loading the partnership" panels={3} />
    );
  }

  const onSaved = (partner: OrganizationPartner) => {
    setNotice(null);
    put((current) => ({ ...current, partner, organization: null }));
  };
  const onStale = (message: string) => {
    setNotice(message);
    void load();
  };

  const notices = (
    <>
      {refreshError ? (
        <StaleFigures message={partnerErrorText(refreshError, "load")} onRetry={retry} />
      ) : null}
      {notice ? (
        <p className="text-body text-error m-0" role="alert">
          {notice}
        </p>
      ) : null}
    </>
  );

  if (!data.partner) {
    return (
      <div className="flex w-full flex-col gap-3">
        {notices}
        <NewPartner
          tree={tree}
          userId={userId}
          organization={data.organization!}
          onSaved={(partner) => {
            onSaved(partner);
            toast.add({
              type: "success",
              title: "Partner added",
              description: `${partner.label} can now invite its members.`,
            });
          }}
          onStale={onStale}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {notices}
      <Partnership
        tree={tree}
        partner={data.partner}
        standard={data.standard}
        onSaved={onSaved}
        onStale={onStale}
      />
      {history}
    </div>
  );
}

function NewPartner({
  tree,
  userId,
  organization,
  onSaved,
  onStale,
}: {
  tree: Tree;
  userId: string;
  organization: OrganizationAccount;
  onSaved: (partner: OrganizationPartner) => void;
  onStale: (message: string) => void;
}) {
  const name = organization.name || "This organization";
  const organizationHref = `/${tree}/organizations/${encodeURIComponent(userId)}`;
  const openOrganization = (
    <Button
      variant="secondary"
      nativeButton={false}
      render={<Link href={organizationHref} />}
    >
      Open the organization
    </Button>
  );
  if (tree === "ops") {
    return (
      <EmptyState
        title={`${name} is not a partner`}
        body="A Super Admin can make a verified organization a partner."
        action={openOrganization}
      />
    );
  }
  if (!canBePartner(organization)) {
    return (
      <EmptyState
        title={`${name} cannot be a partner yet`}
        body="A partner needs an approved organization account with an officer of record. Once an officer is verified, come back here."
        action={openOrganization}
      />
    );
  }
  return (
    <section
      aria-labelledby="new-partner-heading"
      className="gg-card flex flex-col gap-4 p-3"
    >
      <div>
        <h2
          id="new-partner-heading"
          className="text-h2 text-text-primary m-0 break-words"
        >
          Make {name} a partner
        </h2>
        <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
          {[
            organization.school,
            `Officer of record: ${organization.currentOfficer!.fullName}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
          Its officer can then invite members. The perk is a separate switch and stays as
          it is.
        </p>
      </div>
      <PartnerForm
        userId={userId}
        organizationName={name}
        partner={null}
        onSaved={onSaved}
        onStale={onStale}
      />
    </section>
  );
}

function Partnership({
  tree,
  partner,
  standard,
  onSaved,
  onStale,
}: {
  tree: Tree;
  partner: OrganizationPartner;
  standard: MemberPerk | null;
  onSaved: (partner: OrganizationPartner) => void;
  onStale: (message: string) => void;
}) {
  const canEdit = tree === "admin";
  const [editing, setEditing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [removing, setRemoving] = useState(false);

  const name = partner.organizationName || partner.label;
  const ended = partner.status === "ended";
  const { source, setting } = perkSetting(partner, standard);
  const state = perkState(setting);
  const reaches = perkReaches(partner);
  const budget = partnerBudget(partner, standard);
  const attention = budgetNeedsAttention(partner, standard);
  const perkHref = `/admin/partner-organizations/${encodeURIComponent(partner.userId)}/perk`;

  return (
    <>
      <header className="gg-card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0 break-words">{name}</h2>
            <p className="text-body text-text-secondary m-0 mt-1">
              Members show as “{memberLabel(partner.label)}”. Partner since{" "}
              {dayWords(partner.partnerSince)}.
            </p>
          </div>
          <StatusChip {...partnerChip(partner)} />
        </div>
        {!ended && !partner.live ? (
          <p className="text-body text-text-primary rounded-field border-warning m-0 border p-3">
            On hold: the organization&apos;s account, approval or officer of record has
            lapsed. Its members get no perk and cannot join until that is fixed on the
            organization.
          </p>
        ) : null}
        <div className="border-outline-subtle flex flex-wrap gap-2 border-t pt-3">
          {canEdit && ended && !editing ? (
            <Button variant="primary" onClick={() => setEditing(true)}>
              Make partner again
            </Button>
          ) : null}
          {canEdit && !ended && !editing ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit partnership
            </Button>
          ) : null}
          <Button
            variant="secondary"
            nativeButton={false}
            render={
              <Link
                href={`/${tree}/organizations/${encodeURIComponent(partner.userId)}`}
              />
            }
          >
            Open the organization
          </Button>
          {canEdit && !ended ? (
            <Button variant="destructive" onClick={() => setEnding(true)}>
              End partnership
            </Button>
          ) : null}
        </div>
      </header>

      {editing ? (
        <section aria-label="Partnership details" className="gg-card p-3">
          <PartnerForm
            key={partner.version}
            userId={partner.userId}
            organizationName={name}
            partner={partner}
            onCancel={() => setEditing(false)}
            onStale={onStale}
            onSaved={(saved) => {
              setEditing(false);
              onSaved(saved);
              toast.add({ type: "success", title: "Partnership saved" });
            }}
          />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section
          aria-labelledby="perk-heading"
          className="gg-card flex flex-col gap-3 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="perk-heading" className="text-h3 text-text-primary m-0">
              Member perk
            </h3>
            <StatusChip
              {...(reaches || state !== "on" ? PERK_CHIP[state] : PERK_CHIP.off)}
            />
          </div>
          <p className="text-body text-text-secondary m-0">
            {source === "own"
              ? "This organization has its own perk, used instead of the standard one."
              : source === "standard"
                ? "Uses the standard perk, the same as other partners."
                : "No perk has been set, so members get no money off."}
          </p>
          {setting ? <PerkPreview perk={setting} label={partner.label} /> : null}
          {!reaches && state === "on" ? (
            <p className="text-body text-text-primary m-0">
              {ended
                ? "The partnership has ended, so members get no perk."
                : "The partnership is on hold, so members get no perk for now."}
            </p>
          ) : null}
          {canEdit && !ended ? (
            <div className="flex flex-wrap gap-2">
              {source === "none" ? (
                <Button
                  variant={editing ? "secondary" : "primary"}
                  nativeButton={false}
                  render={<Link href="/admin/partner-organizations/standard-perk" />}
                >
                  Set the standard perk
                </Button>
              ) : null}
              <Button
                variant={editing || source === "none" ? "secondary" : "primary"}
                nativeButton={false}
                render={<Link href={perkHref} />}
              >
                {source === "own" ? "Change its perk" : "Set its own perk"}
              </Button>
              {source === "own" ? (
                <Button variant="secondary" onClick={() => setRemoving(true)}>
                  Use the standard perk
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section
          aria-labelledby="budget-heading"
          className="gg-card flex flex-col gap-3 p-3"
        >
          <h3 id="budget-heading" className="text-h3 text-text-primary m-0">
            Budget
          </h3>
          <BudgetMeter budget={budget} warn={attention} />
          {attention && setting ? (
            <p
              role="status"
              className="text-body text-text-primary rounded-field border-warning m-0 border p-3"
            >
              {budgetWarning(budget, setting)}
              {canEdit
                ? source === "own"
                  ? " Change its perk to raise the cap."
                  : " Set its own perk to raise the cap for this organization alone."
                : " A Super Admin can raise the cap."}
            </p>
          ) : null}
        </section>

        <section
          aria-labelledby="results-heading"
          className="gg-card flex flex-col gap-3 p-3"
        >
          <div>
            <h3 id="results-heading" className="text-h3 text-text-primary m-0">
              Results, {partner.results.term.label}
            </h3>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              Until {dayWords(partner.results.term.endsOn)}. Paid orders only.
            </p>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-3">
            <Figure
              label="Members"
              value={partner.results.memberCount.toLocaleString("en-PH")}
            />
            <Figure
              label="Members who ordered"
              value={partner.results.membersOrdered.toLocaleString("en-PH")}
            />
            <Figure
              label="Member orders"
              value={partner.results.memberOrders.toLocaleString("en-PH")}
            />
            <Figure
              label="Members saved"
              value={formatPhp(partner.results.membersSavedMinor)}
            />
          </dl>
          <p className="text-caption text-text-muted m-0">
            Totals only. Member names stay with the organization&apos;s officer.
          </p>
        </section>

        <section
          aria-labelledby="benefits-heading"
          className="gg-card flex flex-col gap-3 p-3"
        >
          <h3 id="benefits-heading" className="text-h3 text-text-primary m-0">
            Partner benefits
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {BENEFITS.map(({ key, label }) => (
              <li key={key} className="flex items-center justify-between gap-3">
                <span className="text-body text-text-primary">{label}</span>
                <StatusChip
                  {...(partner.benefits[key]
                    ? {
                        label: "Included",
                        tone: "success" as const,
                        icon: "circle-check" as const,
                      }
                    : {
                        label: "Not included",
                        tone: "neutral" as const,
                        icon: "circle-dashed" as const,
                      })}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ReasonDialog
        open={ending}
        title={`End the partnership with ${name}?`}
        description="The organization gets a notice. You can make it a partner again later."
        confirmLabel="End partnership"
        busyLabel="Ending…"
        destructive
        onClose={() => setEnding(false)}
        onStale={(message) => {
          setEnding(false);
          onStale(message);
        }}
        onConfirm={async (reason) => {
          const saved = await saveOrganizationPartner(partner.userId, {
            ...partnerInput(partnerDraft(partner, partner.partnerSince), "ended"),
            expectedVersion: partner.version,
            reason,
          });
          setEnding(false);
          setEditing(false);
          onSaved(saved);
          toast.add({ type: "success", title: "Partnership ended" });
        }}
      >
        <ul className="text-body text-text-primary m-0 flex list-disc flex-col gap-1 pl-5">
          <li>Members stop getting the perk right away.</li>
          <li>Contacts still waiting on its member list are erased for good.</li>
          <li>Orders already placed do not change.</li>
        </ul>
      </ReasonDialog>

      <ReasonDialog
        open={removing && source === "own"}
        title={`Put ${name} back on the standard perk?`}
        description={NEW_ORDERS_NOTE}
        confirmLabel="Use the standard perk"
        onClose={() => setRemoving(false)}
        onStale={(message) => {
          setRemoving(false);
          onStale(message);
        }}
        onConfirm={async (reason) => {
          const saved = await removePartnerPerk(partner.userId, {
            expectedVersion: partner.perkOverride!.version,
            reason,
          });
          setRemoving(false);
          onSaved(saved);
          toast.add({ type: "success", title: "Now on the standard perk" });
        }}
      >
        <PerkPreview
          perk={
            standard ?? {
              enabled: false,
              amountMinor: 0,
              maxOrdersPerTerm: 0,
              endsAt: partner.results.term.endsOn,
            }
          }
          label={partner.label}
        />
      </ReasonDialog>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-h2 text-text-primary m-0 tabular-nums">{value}</dd>
    </div>
  );
}
