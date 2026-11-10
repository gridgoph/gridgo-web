/** A Home promo as `GET /ops/promotions` sends it (gridgo-api docs/HOME_PROMOTIONS_API.md). */
export function rawHomePromo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "promo_davaogo",
    name: "DavaoGo",
    logo: {
      fileId: "file_logo",
      contentType: "image/png",
      downloadUrl: "https://files.example/logo.png",
      expiresAt: "2026-11-10T00:05:00.000Z",
    },
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
    ...extra,
  };
}
