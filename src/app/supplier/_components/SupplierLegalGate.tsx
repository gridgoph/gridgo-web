"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import { SkeletonCards } from "@/components/ui/loading";
import { ApiError } from "@/lib/api/client";
import { acceptSupplierLegal, getSupplierLegalPending } from "@/lib/api/supplier-self";
import {
  LEGAL_VERSION_CHANGED,
  legalBlocksWork,
  legalGateAllows,
  type LegalPending,
  type LegalVersion,
} from "@/lib/supplier-legal";

type GateValue = {
  status: "unknown" | "clear" | "blocked";
  pending: LegalVersion[];
  error: string | null;
  accepting: boolean;
  accept: (versionIds: string[]) => Promise<boolean>;
};

const Gate = createContext<GateValue | null>(null);

export function useSupplierLegal(): GateValue {
  const value = useContext(Gate);
  if (!value) throw new Error("Supplier legal gate is not mounted.");
  return value;
}

const INSTALLATION_KEY = "gridgo.supplier.web.installationId";

function webContext(): { app: string; device: string } {
  let device = "supplier-web";
  try {
    const stored = window.localStorage.getItem(INSTALLATION_KEY);
    if (stored) device = stored;
    else {
      device = `supplier-web-${crypto.randomUUID()}`;
      window.localStorage.setItem(INSTALLATION_KEY, device);
    }
  } catch {
    device = "supplier-web";
  }
  return { app: "gridgo-web/supplier", device };
}

export function SupplierLegalGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<GateValue["status"]>("unknown");
  const [pending, setPending] = useState<LegalVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setStatus((current) => (current === "unknown" ? "clear" : current));
    }, 5000);
    void getSupplierLegalPending()
      .then((answer) => {
        if (cancelled) return;
        const next = answer.pending ?? [];
        setPending(next);
        setStatus(legalBlocksWork(answer) ? "blocked" : "clear");
      })
      .catch((caught) => {
        if (cancelled) return;
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 405)) {
          setStatus("clear");
          setPending([]);
          return;
        }
        setStatus((current) => (current === "unknown" ? "clear" : current));
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  useEffect(() => {
    if (status === "blocked" && !legalGateAllows(pathname)) {
      router.replace("/supplier/legal/review");
    }
  }, [status, pathname, router]);

  async function accept(versionIds: string[]): Promise<boolean> {
    if (accepting || pending.length === 0) return pending.length === 0;
    if (versionIds.join("|") !== pending.map((doc) => doc.id).join("|")) return false;
    setAccepting(true);
    setError(null);
    try {
      const answer: LegalPending = await acceptSupplierLegal(versionIds, webContext());
      const left = answer.pending ?? [];
      setPending(left);
      setStatus(legalBlocksWork(answer) ? "blocked" : "clear");
      return left.length === 0;
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "legal_version_changed") {
        setError(LEGAL_VERSION_CHANGED);
        const fresh = await getSupplierLegalPending().catch(() => null);
        if (fresh) {
          setPending(fresh.pending ?? []);
          setStatus(legalBlocksWork(fresh) ? "blocked" : "clear");
        }
        return false;
      }
      setError("Your agreement did not reach GRIDGO. Check this browser's connection and try again.");
      return false;
    } finally {
      setAccepting(false);
    }
  }

  const waiting = status === "unknown" && !legalGateAllows(pathname);

  return (
    <Gate.Provider value={{ status, pending, error, accepting, accept }}>
      {waiting ? <SkeletonCards count={2} lines={2} label="Checking terms" /> : children}
    </Gate.Provider>
  );
}
