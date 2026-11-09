import type { UploadProgress } from "@/lib/api/multipart";

export type UploadActivity = {
  id: string;
  filename: string;
  phase: "preparing" | UploadProgress["phase"] | "stored" | "failed";
  loaded: number;
  total: number | null;
  cancel: () => void;
  error?: unknown;
};

const listeners = new Set<(activity: UploadActivity) => void>();
const active = new Map<string, UploadActivity>();
let sequence = 0;

/** One shared notice covers every multipart helper, including dialog uploads. */
export function onUploadActivity(listener: (activity: UploadActivity) => void) {
  listeners.add(listener);
  active.forEach(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function beginUpload(filename: string, cancel: () => void) {
  let activity: UploadActivity = {
    id: `upload-${++sequence}`,
    filename,
    phase: "preparing",
    loaded: 0,
    total: null,
    cancel,
  };
  function update(patch: Partial<UploadActivity>) {
    activity = { ...activity, ...patch };
    if (activity.phase === "stored" || activity.phase === "failed")
      active.delete(activity.id);
    else active.set(activity.id, activity);
    for (const listener of listeners) {
      try {
        listener(activity);
      } catch {
        /* UI never changes the upload result. */
      }
    }
  }
  update({});
  return update;
}
