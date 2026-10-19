"use client";

import { createContext, useContext, type ReactNode } from "react";

const TestOperationsContext = createContext(false);

/**
 * Whether this workspace belongs to a test operations login
 * (`testOperations: true` on `/auth/me/ops`). `RoleGate` provides it from the
 * projection; nothing else may set it.
 */
export function TestOperationsProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return (
    <TestOperationsContext.Provider value={value}>
      {children}
    </TestOperationsContext.Provider>
  );
}

export function useTestOperations(): boolean {
  return useContext(TestOperationsContext);
}
