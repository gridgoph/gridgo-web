"use client";

import Link from "next/link";
import { ExternalLink, Filter } from "lucide-react";

import { StarMeter } from "@/components/survey-responses/SurveyPulse";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SurveyResponse } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  DIRECT_SHOP_QUESTION,
  NOT_WORTH_IT,
  ORDER_AGAIN_QUESTION,
  PRICE_WORTH_QUESTION,
  accountTypeLabel,
  categoryLabel,
  directShopLabel,
  orderAgainLabel,
  orderSizeLabel,
  priceWorthLabel,
} from "@/lib/pricing-feedback";
import {
  NPS_GROUP_LABEL,
  followUpReasons,
  fulfillmentLabel,
  isLowStars,
  npsGroup,
  priceFeelingLabel,
  questionLabel,
  rewardLabel,
  tagIsNegative,
  tagLabel,
} from "@/lib/survey-responses";
import { formatManila } from "@/lib/vouchers";

type Props = {
  response: SurveyResponse | null;
  /** The order's title, when the order list has it. */
  orderTitle: string | null;
  /** Taxonomy names by category code; a code without one reads as words. */
  categoryNames?: ReadonlyMap<string, string>;
  onClose: () => void;
  onShowClient: (clientId: string) => void;
};

/**
 * One response as the client gave it: each question in the order they saw
 * it, their tags and note, why it was flagged, the reward, and the dates.
 * Read-only: the API has no edit, and the flag cannot be cleared.
 */
const NO_NAMES: ReadonlyMap<string, string> = new Map();

export function SurveyResponseSheet({ response, orderTitle, categoryNames = NO_NAMES, onClose, onShowClient }: Props) {
  return (
    <Sheet
      open={response !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        {response ? (
          <Body
            response={response}
            orderTitle={orderTitle}
            categoryNames={categoryNames}
            onShowClient={onShowClient}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const HEADING = "text-body text-text-primary m-0";
const BOLD = { fontFamily: "var(--font-bold)" } as const;

function Body({
  response,
  orderTitle,
  categoryNames,
  onShowClient,
}: {
  response: SurveyResponse;
  orderTitle: string | null;
  categoryNames: ReadonlyMap<string, string>;
  onShowClient: (clientId: string) => void;
}) {
  // An API from before the pricing questions sends none of these fields.
  const asksPricing = "priceWorthTags" in response || "directShopComparison" in response;
  const reasons = followUpReasons(response);
  const group = npsGroup(response.recommendScore);
  const kind = response.fulfillmentKind;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <SheetHeader className="gap-2 p-0 pr-10">
        <SheetTitle>
          <span className="text-h3 text-text-primary">{orderTitle || `Order ${response.orderId}`}</span>
        </SheetTitle>
        <SheetDescription>
          <span className="text-body text-text-secondary">
            {fulfillmentLabel(kind)} survey, sent {formatManila(response.submittedAt)}
          </span>
        </SheetDescription>
        {response.needsFollowUp ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="warning" icon="triangle-alert" label="Needs follow-up" />
          </div>
        ) : null}
      </SheetHeader>

      {response.needsFollowUp ? (
        <section className="gg-panel flex flex-col gap-1" aria-labelledby="survey-follow-up">
          <h3 id="survey-follow-up" className={HEADING} style={BOLD}>
            Why it is flagged
          </h3>
          <ul className="text-body text-text-primary m-0 flex list-disc flex-col gap-0.5 pl-5">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p className="text-caption text-text-muted m-0 mt-1">
            GRIDGO flags any star score of 2 or less and any recommend score from 0 to 6. The flag
            is automatic and stays on the response. The survey never opens an issue, refund or
            claim; if the client reported a problem, it is on the order.
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="survey-answers">
        <h3 id="survey-answers" className={HEADING} style={BOLD}>
          Answers
        </h3>
        <StarAnswer
          question={questionLabel("fulfillmentStars", kind)}
          value={response.fulfillmentStars}
          tags={response.fulfillmentTags}
        />
        <StarAnswer question={questionLabel("easeStars")} value={response.easeStars} tags={response.easeTags} />
        <Answer question={questionLabel("priceFeeling")}>
          <p className="text-body text-text-primary m-0">{priceFeelingLabel(response.priceFeeling)}</p>
          <p className="text-caption text-text-muted m-0">
            {response.expectedPriceMinor != null
              ? `Expected to pay ${formatPhp(response.expectedPriceMinor)}`
              : "No expected price given"}
          </p>
        </Answer>
        {asksPricing ? (
          <>
            <Answer question={DIRECT_SHOP_QUESTION}>
              <OptionalChoice value={response.directShopComparison ? directShopLabel(response.directShopComparison) : null} />
            </Answer>
            <Answer question={PRICE_WORTH_QUESTION}>
              {response.priceWorthTags?.length ? (
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Reasons">
                  {response.priceWorthTags.map((code) => (
                    <li
                      key={code}
                      className={
                        code === NOT_WORTH_IT
                          ? "border-error text-caption text-error inline-flex items-center rounded-full border px-2 py-0.5"
                          : "border-outline text-caption text-text-secondary inline-flex items-center rounded-full border px-2 py-0.5"
                      }
                    >
                      {priceWorthLabel(code)}
                    </li>
                  ))}
                </ul>
              ) : (
                <OptionalChoice value={null} />
              )}
            </Answer>
            <Answer question={ORDER_AGAIN_QUESTION}>
              <OptionalChoice value={response.orderAgainAtPrice ? orderAgainLabel(response.orderAgainAtPrice) : null} />
            </Answer>
          </>
        ) : null}
        <StarAnswer question={questionLabel("qualityStars")} value={response.qualityStars} optional />
        <Answer question={questionLabel("recommendScore")}>
          {response.recommendScore == null ? (
            <p className="text-body text-text-muted m-0">Not answered (optional)</p>
          ) : (
            <p className="text-body text-text-primary m-0">
              <span className="tabular-nums" style={BOLD}>
                {response.recommendScore}
              </span>{" "}
              of 10{group ? `, ${NPS_GROUP_LABEL[group].toLowerCase()}` : ""}
            </p>
          )}
        </Answer>
        <Answer question="What would make GRIDGO better?">
          {response.improvementNote ? (
            <blockquote className="border-outline text-body text-text-primary m-0 border-l-2 pl-3 break-words whitespace-pre-wrap">
              {response.improvementNote}
            </blockquote>
          ) : (
            <p className="text-body text-text-muted m-0">No note</p>
          )}
        </Answer>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="survey-reward">
        <h3 id="survey-reward" className={HEADING} style={BOLD}>
          Reward
        </h3>
        <p className="text-body text-text-primary m-0">{rewardLabel(response.rewardStatus)}</p>
        <p className="text-caption text-text-muted m-0 break-all">
          {response.rewardStatus === "issued" && response.rewardVoucherId
            ? `Voucher ${response.rewardVoucherId}. The same voucher whatever the answers.`
            : "The answer is kept. A client earns one survey voucher every 7 days at most, and this order will never earn one later."}
        </p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="survey-dates">
        <h3 id="survey-dates" className={HEADING} style={BOLD}>
          Dates
        </h3>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <DateRow label={kind === "pickup" ? "Picked up" : "Delivered"} at={response.completedAt} />
          <DateRow label="Survey opened" at={response.openedAt} />
          <DateRow label="Client notified" at={response.notifiedAt} />
          {response.dismissedAt ? <DateRow label="Skipped at first" at={response.dismissedAt} /> : null}
          <DateRow label="Answered" at={response.submittedAt} />
          <DateRow label="Survey closed" at={response.expiresAt} />
        </dl>
        <p className="text-caption text-text-muted m-0">Philippine time.</p>
      </section>

      {"orderTotalMinor" in response || "accountType" in response ? (
        <section className="flex flex-col gap-2" aria-labelledby="survey-order-facts">
          <h3 id="survey-order-facts" className={HEADING} style={BOLD}>
            What the filters read
          </h3>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-caption text-text-muted">Order total</dt>
            <dd className="text-caption text-text-primary m-0">
              {response.orderTotalMinor != null
                ? `${formatPhp(response.orderTotalMinor)} (${orderSizeLabel(response.orderSize)})`
                : "—"}
            </dd>
            <dt className="text-caption text-text-muted">
              {(response.categoryCodes?.length ?? 0) > 1 ? "Categories" : "Category"}
            </dt>
            <dd className="text-caption text-text-primary m-0">
              {response.categoryCodes?.length
                ? response.categoryCodes.map((code) => categoryLabel(code, categoryNames)).join(", ")
                : "—"}
            </dd>
            <dt className="text-caption text-text-muted">Account type</dt>
            <dd className="text-caption text-text-primary m-0">{accountTypeLabel(response.accountType)}</dd>
          </dl>
          <p className="text-caption text-text-muted m-0">The account type is the client&apos;s today.</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="survey-links">
        <h3 id="survey-links" className={HEADING} style={BOLD}>
          Order and client
        </h3>
        <p className="text-caption text-text-muted m-0 break-all">
          Order {response.orderId}, client account {response.clientId}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/admin/orders/${encodeURIComponent(response.orderId)}`} />}
          >
            <ExternalLink aria-hidden />
            Open order
          </Button>
          <Button variant="outline" onClick={() => onShowClient(response.clientId)}>
            <Filter aria-hidden />
            This client&apos;s responses
          </Button>
        </div>
      </section>
    </div>
  );
}

function OptionalChoice({ value }: { value: string | null }) {
  return value ? (
    <p className="text-body text-text-primary m-0">{value}</p>
  ) : (
    <p className="text-body text-text-muted m-0">Not answered (optional)</p>
  );
}

function Answer({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption text-text-muted m-0">{question}</p>
      {children}
    </div>
  );
}

function StarAnswer({
  question,
  value,
  tags,
  optional,
}: {
  question: string;
  value: number | null;
  tags?: string[];
  optional?: boolean;
}) {
  return (
    <Answer question={question}>
      {value == null ? (
        <p className="text-body text-text-muted m-0">Not answered{optional ? " (optional)" : ""}</p>
      ) : (
        <p className="text-body m-0 flex items-center gap-2">
          <StarMeter value={value} />
          <span className={isLowStars(value) ? "text-error" : "text-text-primary"} style={BOLD}>
            {value} of 5
          </span>
        </p>
      )}
      {tags ? <TagList tags={tags} /> : null}
    </Answer>
  );
}

export function TagList({ tags, limit }: { tags: string[]; limit?: number }) {
  if (!tags.length) return null;
  const shown = limit ? tags.slice(0, limit) : tags;
  const hidden = tags.length - shown.length;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Tags">
      {shown.map((tag) => (
        <TagChip key={tag} tag={tag} />
      ))}
      {hidden > 0 ? (
        <li className="text-caption text-text-muted inline-flex items-center px-1">+{hidden} more</li>
      ) : null}
    </ul>
  );
}

function TagChip({ tag }: { tag: string }) {
  const negative = tagIsNegative(tag);
  return (
    <li
      className={
        negative
          ? "border-error text-caption text-error inline-flex items-center rounded-full border px-2 py-0.5"
          : "border-outline text-caption text-text-secondary inline-flex items-center rounded-full border px-2 py-0.5"
      }
    >
      {tagLabel(tag)}
    </li>
  );
}

function DateRow({ label, at }: { label: string; at: string | null }) {
  return (
    <>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-caption text-text-primary m-0">{at ? formatManila(at) : "—"}</dd>
    </>
  );
}
