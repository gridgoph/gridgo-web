import { apiRequest } from "@/lib/api/client";

export type PrinterStatus = "online" | "offline" | "out_of_paper" | "paper_jam";

export type KioskMachine = {
  id: string;
  name: string;
  paperCount: number;
  printerStatus: PrinterStatus;
  paperSize: "A4";
  priceBwMinor: number;
  priceColorMinor: number;
  lat: number;
  lng: number;
  paymentQrTemplate: string;
  paymentQrEnabled: boolean;
  publicBaseUrl: string;
  updatedAt: string | null;
  coinKey: string;
  hardware: {
    coinsPath: string;
    statusPath: string;
    header: string;
    denominationsMinor: number[];
  };
};

export function getAdminKiosk() {
  return apiRequest<{ ok: true; machine: KioskMachine }>("/admin/kiosk");
}

export function updateAdminKiosk(patch: Record<string, unknown>) {
  return apiRequest<{ ok: true; machine: KioskMachine }>("/admin/kiosk", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
