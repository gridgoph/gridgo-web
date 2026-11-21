/**
 * This browser's non-secret installation id: `supplier-web-<uuid>`, kept in
 * localStorage. The supplier legal acceptance names its device with it, and a
 * shop's file reads are attributed to it (gridgo-api EXPRESS_API.md: 1–128
 * letters, digits and `_.:-`; never a push token or hardware id).
 */
const INSTALLATION_KEY = "gridgo.supplier.web.installationId";
const FALLBACK = "supplier-web";

export function supplierWebDeviceId(): string {
  try {
    const stored = window.localStorage.getItem(INSTALLATION_KEY);
    if (stored && /^[A-Za-z0-9_.:-]{1,128}$/.test(stored)) return stored;
    const created = `supplier-web-${crypto.randomUUID()}`;
    window.localStorage.setItem(INSTALLATION_KEY, created);
    return created;
  } catch {
    return FALLBACK;
  }
}
