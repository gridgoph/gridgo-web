/**
 * Supplier-facing state actions — mirrors gridgo-supplier/lib/jobState.ts.
 * Only the one valid action for a job's current state is offered.
 */

export type SupplierActionKind =
  | "accept"
  | "decline"
  | "request_payment"
  | "start_production"
  | "self_qc"
  | "ready_for_pickup";

export type SupplierAction = {
  kind: SupplierActionKind;
  label: string;
  targetState: string;
  primary: boolean;
  destructive?: boolean;
};

export function actionsForJob(state: string): SupplierAction[] {
  switch (state) {
    case "supplier_assigned":
      return [
        {
          kind: "accept",
          label: "Accept job",
          targetState: "supplier_accepted",
          primary: true,
        },
        {
          kind: "decline",
          label: "Decline",
          targetState: "approved_for_matching",
          primary: false,
          destructive: true,
        },
      ];
    case "supplier_accepted":
      return [
        {
          kind: "request_payment",
          label: "Send for payment",
          targetState: "awaiting_payment",
          primary: true,
        },
      ];
    case "payment_authorized":
      return [
        {
          kind: "start_production",
          label: "Start production",
          targetState: "production",
          primary: true,
        },
      ];
    case "production":
      return [
        {
          kind: "self_qc",
          label: "Complete self-QC",
          targetState: "supplier_self_qc",
          primary: true,
        },
      ];
    case "supplier_self_qc":
      return [
        {
          kind: "ready_for_pickup",
          label: "Ready for pickup",
          targetState: "ready_for_dispatch",
          primary: true,
        },
      ];
    default:
      return [];
  }
}

export function primaryAction(state: string): SupplierAction | null {
  return actionsForJob(state).find((a) => a.primary) ?? null;
}

export function needsSupplierAction(state: string): boolean {
  return actionsForJob(state).some((a) => a.primary);
}
