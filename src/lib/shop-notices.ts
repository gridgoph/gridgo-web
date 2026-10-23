/**
 * Shop notice wording, from the supplier app's alert presenters.
 * A client transfer step is not work for the shop.
 */

export type ShopNotice = { title: string; body: string };

const CLIENT_TRANSFER = new Set([
  "refund_destination",
  "refund_attempt",
  "refund_unknown",
  "refund_failed",
]);

const REFUND: Record<string, ShopNotice> = {
  refund_requested: {
    title: "Job paused for a refund review",
    body: "The client asked for a refund. Stop work on this job until Operations settles it. Money already released to you stays yours.",
  },
  refund_reviewed: {
    title: "Refund under review",
    body: "Operations is reviewing the client's request. The job stays paused until they settle it.",
  },
  refund_settled: {
    title: "Job settled",
    body: "Operations settled the refund. The parts of your payout not yet paid are replaced by the agreed settlement. Open the job to see what you keep.",
  },
  refund_rejected: {
    title: "Refund request closed",
    body: "The client's refund request was declined. Its refund hold is lifted; other holds may still apply. Open the job to see the next permitted step.",
  },
  refund_withdrawn: {
    title: "Refund request withdrawn",
    body: "The client withdrew their refund request. Its refund hold is lifted; other holds may still apply. Open the job to see the next permitted step.",
  },
  refund_paid: {
    title: "Refund complete",
    body: "Operations finished the client's refund. Nothing more is needed from your shop.",
  },
  refund_supplier_paid: {
    title: "Settlement payout sent",
    body: "Operations sent your agreed settlement payout for this job. The wallet transfer evidence is on the job.",
  },
};

const CHANGES: Record<string, ShopNotice> = {
  order_change_requested: {
    title: "Change request sent",
    body: "The client approves or declines it. Until they approve, make the job as ordered.",
  },
  order_change_accepted: {
    title: "Change approved, waiting for payment",
    body: "The client approved your change. Keep making the job as ordered until GRIDGO confirms their payment.",
  },
  order_change_payment_submitted: {
    title: "Payment for the change sent",
    body: "GRIDGO is checking the client's payment. Keep making the job as ordered until it is confirmed.",
  },
  order_change_payment_rejected: {
    title: "Payment for the change not confirmed",
    body: "GRIDGO could not confirm the client's payment yet. Keep making the job as ordered.",
  },
  order_change_applied: {
    title: "Change agreed",
    body: "Make the job with the change. Open the job to see it.",
  },
  order_change_declined: {
    title: "Change declined",
    body: "The client declined your change. Make the job as ordered.",
  },
  order_change_closed: {
    title: "Change request closed",
    body: "The job moved on before your change was settled. Make it as ordered.",
  },
};

const DEADLINES: Record<string, ShopNotice> = {
  order_reschedule_requested: {
    title: "Deadline request sent",
    body: "The client has 24 hours to answer. Keep working to your current ready-by until they do.",
  },
  order_reschedule_accepted: {
    title: "New deadline accepted",
    body: "The client agreed to your new ready-by. Open the job to see it.",
  },
  order_reschedule_declined: {
    title: "New deadline declined",
    body: "The client declined. Pause work on this job while GRIDGO sorts out the next step with them.",
  },
  order_reschedule_expired: {
    title: "Deadline request not answered",
    body: "The client did not answer in 24 hours. Your original ready-by still applies, and Operations will follow up.",
  },
  order_reschedule_operations_required: {
    title: "Deadline request with Operations",
    body: "Operations is deciding what happens next on this job. Open it to see your current dates, any work hold, and who acts next.",
  },
  order_reschedule_rematched: {
    title: "Job moved to another shop",
    body: "The client accepted a replacement shop. Open Jobs for any work currently assigned to you; earlier work stays in Your record.",
  },
  order_reschedule_refund_requested: {
    title: "Client chose a refund",
    body: "The client asked for a full refund after declining the new deadline. Nothing more is needed from your shop.",
  },
  order_reschedule_resolved: {
    title: "Deadline request resolved",
    body: "Operations recorded how the job carries on. Open it to see where it stands.",
  },
};

export function clientTransferNotice(type: string | undefined): boolean {
  return Boolean(type && CLIENT_TRANSFER.has(type));
}

export function presentShopNotice(alert: {
  type?: string;
  body?: string;
}): ShopNotice | null {
  const type = alert.type ?? "";
  const body = alert.body ?? "";
  if (type === "order_call_missed") {
    return {
      title: "Missed call from the rider",
      body: "The rider collecting a job tried to call your shop. Open the job to call back.",
    };
  }
  if (type === "order_call_incoming") {
    return {
      title: "The rider called",
      body: "The rider collecting a job called your shop. Open the job to call back if you missed it.",
    };
  }
  if (type.startsWith("refund_")) {
    if (CLIENT_TRANSFER.has(type)) {
      return {
        title: "Client refund update",
        body: "Operations is handling the client's side of the refund. Nothing changes for your shop.",
      };
    }
    return (
      REFUND[type] ?? {
        title: "Refund update",
        body: "Operations updated a refund on this job. Open it to see where it stands.",
      }
    );
  }
  if (type === "production_lapse_warning") {
    const tier = /\bthis is (minor|moderate|severe) lateness\b/i
      .exec(body)?.[1]
      ?.toLowerCase();
    const warningOnly = /\bwarning only\b/i.test(body);
    return {
      title: tier ? `Late production: ${tier}` : "Late production warning",
      body: `This job is past its ready-by time. ${
        warningOnly ? "This is a warning only — nothing comes off your payout. " : ""
      }Open it to see how it was measured and what applies.`,
    };
  }
  if (type === "production_lapse_deduction") {
    const amount = /deduction of (.+?) was applied/i.exec(body)?.[1]?.trim();
    return {
      title: "Late production deduction",
      body: `${amount ? `${amount} was deducted` : "A deduction was taken"} from this job's remaining unpaid balance at the time of the assessment. Nothing carries over to another job.`,
    };
  }
  if (type === "shop_recovery") {
    if (/accepted a replacement/i.test(body)) {
      return {
        title: "Replacement shop confirmed",
        body: "The client accepted a replacement shop. Open Jobs for any work currently assigned to you; earlier work stays in Your record.",
      };
    }
    if (/full refund\. Operations/i.test(body)) {
      return {
        title: "Client chose a refund",
        body: "The client chose a full refund on a job your shop let go. Nothing more is needed from you.",
      };
    }
    return {
      title: "Job back with GRIDGO",
      body: "GRIDGO is handling the next step after your shop could not keep this job. Open Jobs for your current assignments; the event stays in Your record.",
    };
  }
  if (type.startsWith("order_reschedule_")) {
    return (
      DEADLINES[type] ?? {
        title: "Deadline request update",
        body: "Something changed on your deadline request. Open the job to see where it stands.",
      }
    );
  }
  if (type.startsWith("order_change_")) {
    return (
      CHANGES[type] ?? {
        title: "Change request update",
        body: "Something changed on your change request. Open the job to see where it stands.",
      }
    );
  }
  if (type === "listing_suspended") {
    const reason = body.trim();
    return {
      title: "Taken down by GRIDGO",
      body: reason
        ? `Reason: ${reason.replace(/[.!?]+$/, "")}. Only GRIDGO can lift the take-down. After that, you can put it back on the board.`
        : "Only GRIDGO can lift the take-down. After that, you can put it back on the board.",
    };
  }
  if (type === "listing_restored") {
    return {
      title: "Take-down lifted",
      body: "GRIDGO restored your listing. It stays hidden until you put it back on the board.",
    };
  }
  if (type === "catalog_review_pending") {
    return {
      title: "Sent for review",
      body: "Operations will check it before clients see it. You get an alert when they decide.",
    };
  }
  if (type === "catalog_review_decided") {
    return !body.trim() || body.trim() === "Open your listing to see its review status."
      ? {
          title: "Review finished",
          body: "Operations reviewed what you sent. Open your board to see where it stands.",
        }
      : {
          title: "Operations asked for changes",
          body: `Reason: ${body.trim().replace(/[.!?]+$/, "")}.`,
        };
  }
  return null;
}
