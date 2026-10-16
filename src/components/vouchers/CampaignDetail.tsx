"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BulkIssue } from "@/components/vouchers/BulkIssue";
import { CampaignEditor } from "@/components/vouchers/CampaignEditor";
import { useCampaignStats, usePeople } from "@/components/vouchers/data";
import { VoucherLedger } from "@/components/vouchers/VoucherLedger";
import { VoucherTicket } from "@/components/vouchers/VoucherTicket";
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
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { Progress } from "@/components/ui/progress";
import {
  deleteVoucherCampaign,
  getVoucherCampaign,
  isApiError,
  setVoucherCampaignStatus,
} from "@/lib/api/client";
import type { VoucherCampaign } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  campaignCeilingMinor,
  campaignEditable,
  campaignMoves,
  issueBlocker,
  voucherErrorIsStale,
  voucherErrorMessage,
  type CampaignMove,
} from "@/lib/vouchers";

/**
 * One campaign: its terms as a ticket, how far it has gone against its
 * limit, the moves its status allows (launch, pause, resume, end), the list
 * issue for a campaign GRIDGO hands out, and its own activity and budget.
 */
export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [campaign, setCampaign] = useState<VoucherCampaign | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    search.get("created") ? "Saved as a draft. Check the terms, then launch it." : null,
  );
  const [move, setMove] = useState<CampaignMove | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [ledgerKey, setLedgerKey] = useState(0);
  const { people } = usePeople("everyone");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setCampaign(await getVoucherCampaign(campaignId));
    } catch (err) {
      if (isApiError(err) && err.kind === "not_found") setMissing(true);
      else setLoadError(voucherErrorMessage(err, "Could not load the campaign. Try again."));
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(() => (campaign ? [campaign] : null), [campaign]);
  const { stats, reload: reloadStats } = useCampaignStats(list);
  const own = campaign ? stats[campaign.id] : undefined;
  const issued = own && own !== "failed" ? own.issued : null;

  function refresh() {
    void load();
    void reloadStats();
    setLedgerKey((key) => key + 1);
  }

  async function applyMove() {
    if (!campaign || !move) return;
    setMoveBusy(true);
    setMoveError(null);
    try {
      const updated = await setVoucherCampaignStatus(campaign.id, move.to);
      setCampaign(updated);
      setNotice(
        move.to === "active"
          ? campaign.status === "draft"
            ? "Campaign launched."
            : "Campaign resumed."
          : move.to === "paused"
            ? "Campaign paused."
            : "Campaign ended.",
      );
      setMove(null);
    } catch (err) {
      setMoveError(voucherErrorMessage(err, "The campaign did not change. Try again."));
      if (voucherErrorIsStale(err)) void load();
    } finally {
      setMoveBusy(false);
    }
  }

  async function remove() {
    if (!campaign) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteVoucherCampaign(campaign.id);
      router.push("/admin/vouchers");
    } catch (err) {
      setDeleteError(voucherErrorMessage(err, "The draft was not deleted. Try again."));
      if (voucherErrorIsStale(err)) void load();
    } finally {
      setDeleteBusy(false);
    }
  }

  const back = (
    <Link
      href="/admin/vouchers"
      className="text-body text-text-secondary inline-flex min-h-11 items-center gap-1 self-start underline-offset-2 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All campaigns
    </Link>
  );

  if (missing) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <ErrorState body="This campaign no longer exists. A draft may have been deleted." />
      </div>
    );
  }
  if (loadError && !campaign) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <ErrorState
          body={loadError}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }
  if (!campaign) return <LoadingBlock label="Loading campaign…" />;

  const moves = campaignMoves(campaign.status);
  const blocker = issueBlocker(campaign);
  const editable = campaignEditable(campaign, issued);
  const ceiling = campaignCeilingMinor(campaign.valueMinor, campaign.totalLimit);
  const share = issued !== null ? Math.min(100, (issued / campaign.totalLimit) * 100) : 0;
  const launchIsPrimary = campaign.status === "draft";

  return (
    <div className="flex flex-col gap-4">
      {back}
      {notice ? (
        <p className="text-body text-text-primary m-0" role="status">
          {notice}
        </p>
      ) : null}

      <VoucherTicket
        campaign={campaign}
        issued={issued}
        footer={
          <div className="flex flex-col gap-1">
            <Progress
              value={share}
              aria-label={
                issued !== null
                  ? `${issued} of ${campaign.totalLimit} issued`
                  : "Issued count not loaded"
              }
            />
            <p className="text-caption text-text-muted m-0">
              {issued !== null
                ? `${Math.max(0, campaign.totalLimit - issued).toLocaleString("en-PH")} left to issue. `
                : ""}
              At most {formatPhp(ceiling)} if every voucher is used in full.
            </p>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {moves.map((option, index) => (
          <Button
            key={option.to}
            variant={
              option.final ? "destructive" : launchIsPrimary && index === 0 ? "primary" : "outline"
            }
            onClick={() => {
              setMoveError(null);
              setMove(option);
            }}
          >
            {option.label}
          </Button>
        ))}
        {editable ? (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit terms
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              Delete draft
            </Button>
          </>
        ) : null}
      </div>
      {campaign.status === "draft" ? (
        <p className="text-caption text-text-muted m-0 -mt-2">
          Terms lock when you launch. To change a launched offer, end it and create a new campaign.
        </p>
      ) : null}

      {blocker ? (
        <div className="gg-panel">
          <p className="text-body text-text-secondary m-0 max-w-prose">{blocker}</p>
        </div>
      ) : (
        <BulkIssue
          campaign={campaign}
          issued={issued}
          onIssued={() => {
            setNotice(null);
            refresh();
          }}
          onStale={() => void load()}
        />
      )}

      <section aria-labelledby="campaign-activity" className="flex flex-col gap-3">
        <h2 id="campaign-activity" className="text-h3 text-text-primary m-0">
          Activity and budget
        </h2>
        <VoucherLedger key={ledgerKey} campaigns={list} people={people} fixedCampaignId={campaign.id} />
      </section>

      <AlertDialog open={move !== null} onOpenChange={(open) => !open && !moveBusy && setMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {move?.label} &ldquo;{campaign.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>{move?.effect}</AlertDialogDescription>
          </AlertDialogHeader>
          {moveError ? (
            <p className="text-body text-error m-0" role="alert">
              {moveError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moveBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={move?.final ? "destructive" : "default"}
              disabled={moveBusy}
              onClick={() => void applyMove()}
            >
              {moveBusy ? "Working…" : move?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting} onOpenChange={(open) => !open && !deleteBusy && setDeleting(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{campaign.name}&rdquo; was never launched and nobody holds one, so nothing else
              changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-body text-error m-0" role="alert">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleteBusy} onClick={() => void remove()}>
              {deleteBusy ? "Deleting…" : "Delete draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CampaignEditor
        editing={editing ? campaign : null}
        onClose={() => setEditing(false)}
        onStale={() => void load()}
        onSaved={(saved) => {
          setEditing(false);
          setCampaign(saved);
          setNotice("Terms saved.");
        }}
      />
    </div>
  );
}
