/** Shared API types for the GRIDGO demo backend. */

export type Role = "client" | "supplier" | "rider" | "ops_admin" | "super_admin";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgName?: string;
  supplierName?: string;
  shop?: {
    lat: number;
    lng: number;
    label: string;
  };
};

export type TimelineEntry = {
  at: string;
  state: string;
  by: string;
  note: string;
};

export type Order = {
  id: string;
  clientId: string;
  supplierId: string | null;
  riderId: string | null;
  state: string;
  productId: string;
  title: string;
  quantity: number;
  size: string;
  material: string;
  deadline: string | null;
  address: string;
  zone: string;
  pickup?: { lat: number; lng: number; label: string } | null;
  dropoff?: { lat: number; lng: number; label: string } | null;
  totalMinor: number;
  deliveryFeeMinor: number;
  paymentMethod: string | null;
  paymentStatus: string;
  codEligible: boolean;
  promisedDate: string | null;
  artworkName: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: TimelineEntry[];
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  at: string;
};

export type CreditBalance = {
  clientId: string;
  balanceMinor: number;
  ledger: {
    id: string;
    type: string;
    amountMinor: number;
    balanceAfterMinor: number;
    reason: string;
    at: string;
    actorId: string;
  }[];
};

export type CatalogItem = {
  id: string;
  name: string;
  family: string;
  basePriceMinor: number;
  unit: string;
};
