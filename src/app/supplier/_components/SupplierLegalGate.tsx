"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import Link from "next/link";
import { Button } from "@/components/ui/button";

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
  status: "unknown" | "clear" | "blocked" | "unavailable" | "unsupported";
  pending: LegalVersion[];
  checking: boolean;
  refresh: () => void;
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
  const { user } = useUser();
  const userId = user?.id ?? null;
  return (
    <LegalSession key={userId} userId={userId}>
      {children}
    </LegalSession>
  );
}

function LegalSession({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<GateValue["status"]>("unknown");
  const [pending, setPending] = useState<LegalVersion[]>([]);
  const [notices, setNotices] = useState<LegalVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const acceptBusy = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = () => setAttempt((value) => value + 1);

  const adopt = useCallback((answer: LegalPending) => {
    setPending(answer.pending ?? []);
    setNotices(answer.notices ?? []);
    setStatus(legalBlocksWork(answer) ? "blocked" : "clear");
  }, []);

  useEffect(() => {
    const operation = ++generation.current;
    if (!userId || acceptBusy.current) return;
    setChecking(true);
    void getSupplierLegalPending()
      .then((answer) => {
        if (operation !== generation.current) return;
        adopt(answer);
        setError(null);
      })
      .catch((caught) => {
        if (operation !== generation.current) return;
        if (
          caught instanceof ApiError &&
          (caught.status === 404 || caught.status === 405)
        ) {
          setStatus("unsupported");
          setPending([]);
          setNotices([]);
          setError(null);
        } else {
          setStatus((current) =>
            current === "unknown" || current === "unavailable" ? "unavailable" : current,
          );
          setError(
            "GRIDGO could not check your agreements. Check this browser's connection and try again.",
          );
        }
      })
      .finally(() => {
        if (operation === generation.current) setChecking(false);
      });
    return () => {
      generation.current += 1;
    };
  }, [userId, pathname, attempt, adopt]);

  useEffect(() => {
    const onFocus = () => setAttempt((value) => value + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (status === "blocked" && !legalGateAllows(pathname))
      router.replace("/supplier/legal/review");
  }, [status, pathname, router]);

  async function accept(versionIds: string[]): Promise<boolean> {
    if (acceptBusy.current || status !== "blocked" || pending.length === 0) return false;
    if (versionIds.join("|") !== pending.map((doc) => doc.id).join("|")) return false;
    acceptBusy.current = true;
    generation.current += 1;
    setAccepting(true);
    setChecking(false);
    setError(null);
    try {
      const answer = await acceptSupplierLegal(versionIds, webContext());
      if (!alive.current) return false;
      generation.current += 1;
      adopt(answer);
      return !legalBlocksWork(answer);
    } catch (caught) {
      if (!alive.current) return false;
      if (caught instanceof ApiError && caught.code === "legal_version_changed") {
        const fresh = await getSupplierLegalPending().catch(() => null);
        if (!alive.current) return false;
        if (fresh) adopt(fresh);
        setError(LEGAL_VERSION_CHANGED);
      } else
        setError(
          "Your agreement did not reach GRIDGO. Check this browser's connection and try again.",
        );
      return false;
    } finally {
      acceptBusy.current = false;
      if (alive.current) setAccepting(false);
    }
  }

  const waiting =
    !legalGateAllows(pathname) &&
    (status === "unknown" || status === "blocked" || status === "unavailable");
  return (
    <Gate.Provider
      value={{ status, pending, error, accepting, accept, checking, refresh }}
    >
      {error && !accepting ? (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="text-body text-text-primary m-0">{error}</p>
          <Button type="button" variant="outline" disabled={checking} onClick={refresh}>
            Try again
          </Button>
          <Link href="/supplier/legal" className="text-body text-text-primary underline">
            Read the documents
          </Link>
          <Link
            href="/supplier/privacy"
            className="text-body text-text-primary underline"
          >
            Your data
          </Link>
        </div>
      ) : null}
      {notices.length ? (
        <section aria-label="Document updates" className="mb-4 flex flex-col gap-2">
          <h2 className="text-body text-text-primary m-0">Document updates</h2>
          {notices.map((doc) => (
            <div key={doc.id}>
              <Link
                href={`/supplier/legal/${encodeURIComponent(doc.id)}`}
                className="text-body text-text-primary underline"
              >
                {doc.title}
              </Link>
              {doc.changeSummary ? (
                <p className="text-caption text-text-secondary m-0">
                  {doc.changeSummary}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      {waiting ? (
        status !== "unavailable" ? (
          <SkeletonCards count={2} lines={2} label="Checking terms" />
        ) : null
      ) : (
        children
      )}
    </Gate.Provider>
  );
}
