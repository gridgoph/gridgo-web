"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { PerkForm } from "@/components/organization-partners/PerkForm";
import { PartnerLoadError } from "@/components/organization-partners/states";
import { usePartnerData } from "@/components/organization-partners/usePartnerData";
import { SkeletonDetail } from "@/components/ui/loading";
import { toast } from "@/components/ui/toast";
import {
  getOrganizationPartner,
  getStandardPerk,
  listOrganizationPartners,
  savePartnerPerk,
  saveStandardPerk,
} from "@/lib/api/organization-partners";
import { perkReaches } from "@/lib/organization-partners";

const LIST = "/admin/partner-organizations";

/** The one perk every partner without its own gets. Super Admin only. */
export function StandardPerkPage() {
  const router = useRouter();
  const read = useCallback(async () => {
    const [standard, partners] = await Promise.all([
      getStandardPerk(),
      listOrganizationPartners(),
    ]);
    return { standard, partners };
  }, []);
  const { data, loadError, load, retry } = usePartnerData(read, false);

  if (!data) {
    return loadError ? (
      <PartnerLoadError error={loadError} onRetry={retry} />
    ) : (
      <SkeletonDetail label="Loading the standard perk" panels={2} />
    );
  }

  const onStandard = data.partners.filter((p) => perkReaches(p) && !p.perkOverride);
  const reach =
    onStandard.length === 0
      ? "No partner uses the standard perk yet. New partners start on it."
      : onStandard.length === 1
        ? `Reaches ${onStandard[0]!.label}, and every partner you add without its own perk.`
        : `Reaches ${onStandard.length} partners, and every one you add without its own perk.`;

  return (
    <PerkForm
      setting={data.standard}
      startFrom={null}
      label={null}
      onOffHelp={{
        off: "Off. Members get no money off.",
        on: "On. Members of partners without their own perk get it at checkout.",
      }}
      reach={reach}
      affected={onStandard}
      confirmTitle={
        data.standard ? "Change the standard perk?" : "Set the standard perk?"
      }
      cancelHref={LIST}
      onStale={load}
      onSave={async (input, expectedVersion, reason) => {
        const saved = await saveStandardPerk({ ...input, expectedVersion, reason });
        toast.add({
          type: "success",
          title: saved.enabled
            ? "Standard perk saved and on"
            : "Standard perk saved, off",
          description: "New orders use it from now.",
        });
        router.push(LIST);
      }}
    />
  );
}

/** One organization's own perk, used instead of the standard one. Super Admin only. */
export function PartnerPerkPage({ userId }: { userId: string }) {
  const router = useRouter();
  const read = useCallback(async () => {
    const [partner, standard] = await Promise.all([
      getOrganizationPartner(userId),
      getStandardPerk(),
    ]);
    return { partner, standard };
  }, [userId]);
  const { data, loadError, load, retry } = usePartnerData(read, false);

  if (!data) {
    return loadError ? (
      <PartnerLoadError error={loadError} onRetry={retry} />
    ) : (
      <SkeletonDetail label="Loading the perk" panels={2} />
    );
  }

  const { partner, standard } = data;
  const detail = `${LIST}/${encodeURIComponent(userId)}`;
  const name = partner.organizationName || partner.label;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        A perk for {name} alone, used instead of the standard one.
        {!partner.perkOverride && standard
          ? " It starts from the standard perk's figures; change what is different."
          : ""}
      </p>
      <PerkForm
        setting={partner.perkOverride}
        startFrom={standard}
        label={partner.label}
        onOffHelp={{
          off: "Off for this organization, even while the standard perk is on.",
          on: "On. Its members get this perk at checkout.",
        }}
        reach={`Reaches only ${name}. Other partners keep theirs.`}
        affected={[partner]}
        confirmTitle={`${partner.perkOverride ? "Change" : "Set"} the perk for ${name}?`}
        cancelHref={detail}
        onStale={load}
        onSave={async (input, expectedVersion, reason) => {
          await savePartnerPerk(userId, { ...input, expectedVersion, reason });
          toast.add({
            type: "success",
            title: "Perk saved",
            description: "New orders use it from now.",
          });
          router.push(detail);
        }}
      />
    </div>
  );
}
