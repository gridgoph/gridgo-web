/** A Home promo as `GET /ops/promotions` sends it (contract "Home promo slot"). */
export function rawHomePromo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "promo_davaogo",
    name: "DavaoGo",
    logo: { fileId: "file_logo", url: "https://files.example/logo.png" },
    image: null,
    description: "Rides and deliveries around Davao.",
    tag: "partner",
    linkText: "Visit DavaoGo",
    linkUrl: "https://davaogo.app/",
    tapAction: "sheet",
    style: "light",
    startsAt: "2026-11-10T00:00:00.000Z",
    endsAt: null,
    enabled: true,
    displayOrder: 1,
    status: "live",
    views: 120,
    opens: 30,
    taps: 12,
    updatedAt: "2026-11-10T00:00:00.000Z",
    ...extra,
  };
}
