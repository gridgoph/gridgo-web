"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Clock, Mail, Search, Send, Sparkles } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  grantEarlyAccess,
  listEarlyAccessSignups,
  type EarlyAccessSignup,
  type EarlyAccessStatus,
} from "@/lib/api/early-access";
import {
  earlyAccessStatusLabel,
  earlyAccessStatusVariant,
  filterEarlyAccessSignups,
  formatEarlyAccessDate,
  grantEarlyAccessError,
} from "@/lib/early-access";
import { cn } from "@/lib/utils";

export function EarlyAccessSignupsPanel() {
  const [signups, setSignups] = useState<EarlyAccessSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EarlyAccessStatus>("all");

  const [granting, setGranting] = useState<EarlyAccessSignup | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listEarlyAccessSignups();
      setSignups(res.signups || []);
    } catch (err) {
      setError("Could not load early-access sign-ups. Check the API connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return filterEarlyAccessSignups(signups, search, statusFilter);
  }, [signups, search, statusFilter]);

  const stats = useMemo(() => {
    const total = signups.length;
    const pending = signups.filter((s) => s.status === "pending").length;
    const granted = signups.filter((s) => s.status === "granted").length;
    return { total, pending, granted };
  }, [signups]);

  async function confirmGrant() {
    if (!granting) return;
    setGrantBusy(true);
    setGrantError(null);
    try {
      const res = await grantEarlyAccess(granting.id);
      setNotice(`Access granted for ${granting.email}. Invite email sent with Google Play link.`);
      setSignups((prev) =>
        prev.map((s) =>
          s.id === granting.id
            ? { ...s, status: "granted", grantedAt: res.signup.grantedAt || new Date().toISOString() }
            : s,
        ),
      );
      setGranting(null);
    } catch (err) {
      setGrantError(grantEarlyAccessError(err));
    } finally {
      setGrantBusy(false);
    }
  }

  const columns: DataTableColumn<EarlyAccessSignup>[] = [
    {
      id: "email",
      header: "Google Play email",
      cell: (row) => (
        <span className="font-mono text-body text-text-primary">
          {row.email}
        </span>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: (row) => (
        <span className="text-caption text-text-muted">
          {row.source || "web"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <StatusChip
          tone={earlyAccessStatusVariant(row.status)}
          label={earlyAccessStatusLabel(row.status)}
          icon={row.status === "granted" ? "circle-check" : "clock"}
        />
      ),
    },
    {
      id: "createdAt",
      header: "Requested",
      cell: (row) => (
        <span className="text-caption text-text-muted">
          {formatEarlyAccessDate(row.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => {
        const isGranted = row.status === "granted";
        return (
          <Button
            size="sm"
            variant={isGranted ? "outline" : "default"}
            disabled={isGranted || grantBusy}
            onClick={() => {
              setGrantError(null);
              setGranting(row);
            }}
            className={cn(
              "h-8 px-3 text-caption font-semibold",
              isGranted
                ? "border-border-muted text-text-muted opacity-80 cursor-default"
                : "bg-primary text-black hover:bg-yellow-400",
            )}
          >
            {isGranted ? (
              <span className="flex items-center gap-1">
                <Check size={12} /> Granted
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Send size={12} /> Grant access
              </span>
            )}
          </Button>
        );
      },
    },
  ];

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border-muted bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <h2 className="text-h3 font-bold text-text-primary">
              Website Early-Access Sign-ups
            </h2>
          </div>
          <p className="mt-1 text-body-sm text-text-secondary">
            Android visitors who registered for Google Play early access. Staff marks them granted once added to the Google Group to send their invite email.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {notice ? (
        <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-body-sm text-success">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-text-muted hover:text-text-primary"
          >
            &times;
          </button>
        </div>
      ) : null}

      {/* Summary KPI chips */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1 rounded-xl border border-border-muted bg-surface-variant p-4">
          <span className="text-caption text-text-muted">Total Requests</span>
          <span className="text-h3 font-bold tabular-nums text-text-primary">
            {stats.total}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-warning/20 bg-warning/5 p-4">
          <span className="text-caption text-warning flex items-center gap-1">
            <Clock size={12} /> Pending Approval
          </span>
          <span className="text-h3 font-bold tabular-nums text-text-primary">
            {stats.pending}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-success/20 bg-success/5 p-4">
          <span className="text-caption text-success flex items-center gap-1">
            <CheckCircle2 size={12} /> Access Granted
          </span>
          <span className="text-h3 font-bold tabular-nums text-text-primary">
            {stats.granted}
          </span>
        </div>
      </div>

      {/* Filters and search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search email or source..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          {(["all", "pending", "granted"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-caption font-medium transition-colors",
                statusFilter === filter
                  ? "bg-text-primary text-surface font-semibold"
                  : "bg-surface-variant text-text-muted hover:text-text-primary",
              )}
            >
              {filter === "all" ? "All" : filter === "pending" ? "Pending" : "Granted"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {error ? (
        <p className="text-error text-body p-4 text-center">{error}</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No early-access sign-ups found"
          body={
            search || statusFilter !== "all"
              ? "No sign-up matches your search or filter."
              : "No website visitors have registered for Google Play early access yet."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
        />
      )}

      {/* Grant Access Confirmation Dialog */}
      <AlertDialog
        open={granting !== null}
        onOpenChange={(next) => !next && !grantBusy && setGranting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Grant Google Play early access to {granting?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the sign-up as granted and immediately send the early access email containing the Google Play closed-test opt-in link to <strong>{granting?.email}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {grantError ? (
            <p className="text-body text-error m-0" role="alert">
              {grantError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={grantBusy}
              onClick={() => setGranting(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              disabled={grantBusy}
              onClick={() => void confirmGrant()}
              className="bg-primary text-black hover:bg-yellow-400"
            >
              {grantBusy ? "Granting…" : "Grant & Send Email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
