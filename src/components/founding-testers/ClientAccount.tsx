"use client";

import { useCallback, useEffect, useState } from "react";

import { MissionList } from "@/components/founding-testers/MissionProgress";
import { TesterRewardsList } from "@/components/founding-testers/TesterRewardsList";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { getClientAccount, isApiError, listTesterInvites } from "@/lib/api/client";
import type { ClientAccount as ClientAccountRecord, TesterInvite } from "@/lib/api/types";
import {
  presentTesterLabel,
  presentTesterReward,
  testerLabelNote,
} from "@/lib/founding-testers";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { formatManila } from "@/lib/vouchers";

/**
 * One client account for Operations and Super Admin (`GET /users/:id`): who
 * it is, its Founding Tester label, five steps and reward, the friends it
 * invited (`GET /ops/tester-invites?inviterId=`), and every tester reward it
 * is part of. The voucher's private code is the client's and is never shown.
 * Super Admin voids or resumes a reward from the rewards list here.
 */
export function ClientAccount({
  userId,
  tree,
}: {
  userId: string;
  tree: "ops" | "admin";
}) {
  const [account, setAccount] = useState<ClientAccountRecord | null>(null);
  const [invites, setInvites] = useState<TesterInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [read, invited] = await Promise.all([
          getClientAccount(userId),
          // Older APIs have no invites; the account still reads without them.
          listTesterInvites({ inviterId: userId }, { limit: 500 }).catch(() => null),
        ]);
        setAccount(read);
        setInvites(invited ? invited.invites : null);
        setMissing(false);
      } catch (err) {
        if (isApiError(err) && err.status === 404) {
          setMissing(true);
          setAccount(null);
        } else {
          setError(
            isApiError(err)
              ? `Could not load this account (${err.code}).`
              : "Could not reach the API. Check it is running, then retry.",
          );
        }
      } finally {
        setLoading(false);
      }
    }, [userId]),
  );

  useLiveReload(["identity", "notifications"], load);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !account && !missing)
    return <LoadingBlock label="Loading the account" />;
  if (missing) {
    return (
      <EmptyState
        title="No such account"
        body="This account does not exist, or it was removed."
      />
    );
  }
  if (!account) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const tester = account.foundingTester;
  const label = tester ? presentTesterLabel(tester) : null;
  const reward = tester ? presentTesterReward(tester) : null;

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <section className="gg-card p-3" aria-labelledby="client-account-heading">
        <h2
          id="client-account-heading"
          className="text-h3 text-text-primary m-0 break-words"
        >
          {account.name || "Unnamed client"}
        </h2>
        {tester?.label && label ? (
          <div className="mt-2">
            <StatusChip tone={label.tone} label={label.label} icon={label.icon} />
          </div>
        ) : null}
        <dl className="m-0 mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
          <dt className="text-caption text-text-muted">Email</dt>
          <dd className="text-body text-text-primary m-0 break-words">{account.email}</dd>
          {account.phone ? (
            <>
              <dt className="text-caption text-text-muted">Phone</dt>
              <dd className="text-body text-text-primary m-0">{account.phone}</dd>
            </>
          ) : null}
          {account.orgName ? (
            <>
              <dt className="text-caption text-text-muted">Organization</dt>
              <dd className="text-body text-text-primary m-0">{account.orgName}</dd>
            </>
          ) : null}
          <dt className="text-caption text-text-muted">Account created</dt>
          <dd className="text-body text-text-primary m-0">
            {account.createdAt ? `${formatManila(account.createdAt)}, Manila time` : "—"}
          </dd>
          {account.reviewData ? (
            <>
              <dt className="text-caption text-text-muted">Data</dt>
              <dd className="m-0">
                <StatusChip tone="warning" label="Test account" icon="flask-conical" />
              </dd>
            </>
          ) : null}
          {account.accountStatus && account.accountStatus !== "active" ? (
            <>
              <dt className="text-caption text-text-muted">Standing</dt>
              <dd className="m-0">
                <StatusChip
                  tone={account.accountStatus === "removed" ? "error" : "warning"}
                  label={account.accountStatus === "removed" ? "Removed" : "Suspended"}
                  icon={account.accountStatus === "removed" ? "circle-x" : "ban"}
                />
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="gg-card p-3" aria-labelledby="founding-tester-heading">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="founding-tester-heading" className="text-h3 text-text-primary m-0">
            Founding Tester
          </h2>
          {/* An earned label already sits beside the name. */}
          {label && !tester?.label ? (
            <StatusChip tone={label.tone} label={label.label} icon={label.icon} />
          ) : null}
        </div>
        {!tester || !label || !reward ? (
          <p className="text-body text-text-secondary m-0 mt-2 max-w-prose">
            {account.role === "client"
              ? "Founding Tester progress is not available yet. It appears here once the service is updated."
              : "Founding Tester missions belong to client accounts. This account is not a client."}
          </p>
        ) : (
          <>
            <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
              {testerLabelNote(tester, account.reviewData)}
            </p>
            <div className="mt-3">
              <MissionList progress={tester} />
            </div>
            <h3
              className="text-body text-text-primary m-0 mt-4"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Reward
            </h3>
            <div className="mt-2 flex flex-col items-start gap-1">
              <StatusChip tone={reward.tone} label={reward.label} icon={reward.icon} />
              <p className="text-body text-text-secondary m-0 max-w-prose">
                {reward.detail}
              </p>
            </div>
            {invites ? (
              <>
                <h3
                  className="text-body text-text-primary m-0 mt-4"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  Invites
                </h3>
                <p className="text-body text-text-secondary m-0 mt-1 tabular-nums">
                  {invites.length} invited · {invites.filter((i) => i.clientId).length}{" "}
                  joined · {invites.filter((i) => i.completedAt).length} completed
                </p>
                {invites.some((i) => !i.clientId) ? (
                  <p className="text-caption text-text-muted m-0 mt-1">
                    {invites.filter((i) => !i.clientId).length} form{" "}
                    {invites.filter((i) => !i.clientId).length === 1
                      ? "response is"
                      : "responses are"}{" "}
                    not matched to an account yet. See the Invites tab.
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </section>

      {account.role === "client" ? (
        <section
          className="flex flex-col gap-2 lg:col-span-2"
          aria-labelledby="tester-rewards-heading"
        >
          <h2 id="tester-rewards-heading" className="text-h3 text-text-primary m-0">
            Tester rewards
          </h2>
          <TesterRewardsList tree={tree} clientId={userId} />
        </section>
      ) : null}
    </div>
  );
}
