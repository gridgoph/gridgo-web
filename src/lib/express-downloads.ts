/**
 * What this browser saved for a job, kept beside GRIDGO's own record
 * (`order.fileAccesses`) so the delete-files reminder still knows about a
 * download when an older API keeps no record. Per browser only; every read
 * and write survives blocked storage.
 */
const KEY = "gridgo.supplier.express.downloads";

type Store = Record<string, { files: string[]; deletedAt?: string }>;

function read(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    // Keep the newest 50 jobs; a reminder is about today's work.
    const entries = Object.entries(store).slice(-50);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage blocked: GRIDGO's own record still drives the reminder.
  }
}

export function rememberDownload(orderId: string, fileId: string): void {
  const store = read();
  const entry = store[orderId] ?? { files: [] };
  if (!entry.files.includes(fileId)) entry.files.push(fileId);
  delete entry.deletedAt;
  store[orderId] = entry;
  write(store);
}

export function localDownloads(orderId: string): string[] {
  return read()[orderId]?.files ?? [];
}

/** "I deleted them": the reminder is done for this job on this browser. */
export function acknowledgeDeleted(orderId: string, at: Date = new Date()): void {
  const store = read();
  store[orderId] = { files: store[orderId]?.files ?? [], deletedAt: at.toISOString() };
  write(store);
}

export function deletedAcknowledged(orderId: string): boolean {
  return Boolean(read()[orderId]?.deletedAt);
}
