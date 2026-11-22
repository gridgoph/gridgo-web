"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Zap } from "lucide-react";

import { TeamAvatar } from "@/components/shop-team/TeamAvatar";
import { getMyShopTeam, type ShopTeam } from "@/lib/api/shop-team";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { missionLine, rosterOf, teamPeople } from "@/lib/shop-team";

const FACES = 6;

/**
 * The team in one line on My shop: faces, how many, who was fastest this
 * week and the team mission (only what the API sends this person), and the
 * way to the Team page.
 */
export function TeamStrip({ manage }: { manage: boolean }) {
  const [team, setTeam] = useState<ShopTeam | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setTeam(await getMyShopTeam());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload("identity", load);

  if (failed && !team) return null;
  const { leads, staff } = rosterOf(teamPeople(team?.members ?? [], team?.pinStaff ?? null));
  const people = [...leads, ...staff];
  const fastest = team?.stats?.fastestThisWeek?.name;
  const mission = missionLine(team?.stats?.mission);
  const line = [fastest ? `${fastest} fastest this week` : null, mission ? `Team mission ${mission}` : null]
    .filter(Boolean)
    .join(". ");

  return (
    <Link
      href="/supplier/team"
      data-testid="team-strip"
      className="flex min-h-16 items-center gap-4 rounded-card border border-outline bg-surface p-3 no-underline hover:bg-overlay-hover"
    >
      <span className="flex -space-x-2" aria-hidden>
        {people.slice(0, FACES).map((person, index) => (
          // A phone keeps three faces so the words beside them still fit.
          <span key={person.key} className={index >= 3 ? "hidden sm:inline-flex" : "inline-flex"}>
            <TeamAvatar name={person.name} className="rounded-pill ring-2 ring-surface" />
          </span>
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
          Team{team ? ` · ${people.length}` : ""}
        </span>
        {line ? (
          <span className="text-caption text-text-muted line-clamp-2 sm:truncate">
            {fastest ? <Zap aria-hidden className="mr-1 inline size-3 align-[-1px]" /> : null}
            {line}
          </span>
        ) : null}
      </span>
      <span className="text-body text-text-primary hidden underline sm:inline">{manage ? "Manage team" : "See the team"}</span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-text-muted" />
    </Link>
  );
}
