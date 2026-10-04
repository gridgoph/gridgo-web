"use client";

/**
 * Who may act on a file's deletion in this tree.
 *
 * File plates are shared by every portal role, so the plate cannot decide by
 * itself. Only the Super Admin layout mounts this provider with
 * `deleteEarly`; Operations mounts it with `readRecord` alone (it may read
 * who deleted a file and why from the audit log, never delete one); the
 * supplier tree mounts nothing and gets the closed default. Nav and this flag
 * are presentation only: the API refuses everyone but Super Admin.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type FileDeletionAccess = {
  /** Offer "Delete early" on order file plates. Super Admin only. */
  deleteEarly: boolean;
  /** Read the deletion record (who, when, why) from the audit log. */
  readRecord: boolean;
  /** Bumped after a deletion, so order-level lists re-read the log. */
  version: number;
  noteDeleted: () => void;
};

const CLOSED: FileDeletionAccess = {
  deleteEarly: false,
  readRecord: false,
  version: 0,
  noteDeleted: () => {},
};

const FileDeletionContext = createContext<FileDeletionAccess>(CLOSED);

export function FileDeletionAccessProvider({
  deleteEarly = false,
  readRecord = false,
  children,
}: {
  deleteEarly?: boolean;
  readRecord?: boolean;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const noteDeleted = useCallback(() => setVersion((current) => current + 1), []);
  const value = useMemo(
    () => ({ deleteEarly, readRecord: readRecord || deleteEarly, version, noteDeleted }),
    [deleteEarly, readRecord, version, noteDeleted],
  );
  return <FileDeletionContext.Provider value={value}>{children}</FileDeletionContext.Provider>;
}

export function useFileDeletionAccess(): FileDeletionAccess {
  return useContext(FileDeletionContext);
}
