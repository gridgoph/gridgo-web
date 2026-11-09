import type { Metadata } from "next";

import { JoinTeam } from "@/components/shop-team/JoinTeam";

export const metadata: Metadata = {
  title: "Join a shop · GRIDGO",
  robots: { index: false, follow: false },
};

/** The shop team invite link (`/join-team#token=…`); see `JoinTeam`. */
export default function JoinTeamPage() {
  return <JoinTeam />;
}
