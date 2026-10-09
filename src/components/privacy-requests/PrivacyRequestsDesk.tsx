"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PanelRightOpen } from "lucide-react";

import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { PrivacyRequestSheet } from "@/components/privacy-requests/PrivacyRequestSheet";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { listPrivacyRequests, listUsers } from "@/lib/api/client";
import type { PrivacyRequest, PrivacyRequestStatus, User } from "@/lib/api/types";
import { formatManilaDate } from "@/lib/legal";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  PRIVACY_FILTERS,
  PRIVACY_KIND_LABEL,
  daysUntil,
  dueChip,
  isOpenPrivacyRequest,
  privacyErrorMessage,
  privacyStatusChip,
  sortPrivacyRequests,
  type PrivacyFilter,
} from "@/lib/privacy-requests";

type Props = { tree: "admin" | "ops" };

/** Pages are 100 rows; a launch queue fits in a few. */
const MAX_PAGES = 20;

async function readAll(status?: PrivacyRequestStatus): Promise<{ rows: PrivacyRequest[]; capped: boolean }> {
  const rows: PrivacyRequest[] = [];
  let offset: number | null = 0;
  for (let page = 0; page < MAX_PAGES && offset !== null; page += 1) {
    const result = await listPrivacyRequests(status, offset);
    rows.push(...result.requests);
    offset = result.nextOffset;
  }
  return { rows, capped: offset !== null };
}

function isFilter(value: string | null): value is PrivacyFilter {
  return PRIVACY_FILTERS.some((filter) => filter.value === value);
}

/**
 * The privacy requests queue (LEGAL_API.md "Privacy requests"). A manual
 * queue: staff verify the person, do it by hand, and write down what they
 * did. Open requests come first, earliest due at the top.
 */
export function PrivacyRequestsDesk({ tree }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filterParam = params.get("show");
  const filter: PrivacyFilter = isFilter(filterParam) ? filterParam : "open";
  const openId = params.get("request");

  const [rows, setRows] = useState<PrivacyRequest[] | null>(null);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Map<string, User>>(new Map());
  const [staff, setStaff] = useState<User[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listUsers().catch(() => [] as User[]),
      listUsers("ops_admin").catch(() => [] as User[]),
      listUsers("super_admin").catch(() => [] as User[]),
    ]).then(([everyone, ops, admins]) => {
      if (cancelled) return;
      setPeople(new Map(everyone.map((user) => [user.id, user])));
      const handlers = new Map<string, User>();
      for (const user of [...admins, ...ops]) handlers.set(user.id, user);
      setStaff([...handlers.values()].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        let result: { rows: PrivacyRequest[]; capped: boolean };
        if (filter === "open") {
          const [waiting, working] = await Promise.all([readAll("pending"), readAll("in_progress")]);
          result = { rows: [...waiting.rows, ...working.rows], capped: waiting.capped || working.capped };
        } else {
          result = await readAll(filter === "all" ? undefined : filter);
        }
        setRows(sortPrivacyRequests(result.rows));
        setCapped(result.capped);
        setNow(Date.now());
      } catch (err) {
        setError(privacyErrorMessage(err, "The privacy requests did not load. Try again."));
      } finally {
        setLoading(false);
      }
    }, [filter]),
  );

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);
  useLegalInboxReload("privacy.", load);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const nameOf = useCallback(
    (userId: string | null) => {
      if (!userId) return null;
      const user = people.get(userId);
      return user ? user.name || user.email || userId : userId;
    },
    [people],
  );

  const list = useMemo(() => rows ?? [], [rows]);
  const openRows = list.filter(isOpenPrivacyRequest);
  const overdue = openRows.filter((row) => daysUntil(row.dueAt, now) < 0).length;
  const unassigned = openRows.filter((row) => !row.handlerId).length;
  const selected = list.find((row) => row.id === openId) ?? null;

  const columns = useMemo<DataTableColumn<PrivacyRequest>[]>(
    () => [
      {
        id: "requester",
        header: "Requester",
        primary: true,
        sortValue: (row) => nameOf(row.userId) ?? "",
        filterValue: (row) => `${nameOf(row.userId) ?? ""} ${people.get(row.userId)?.email ?? ""} ${row.userId}`,
        cell: (row) => {
          const user = people.get(row.userId);
          return (
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setParam("request", row.id)}
                className="text-body text-text-primary text-left underline-offset-4 hover:underline"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {nameOf(row.userId)}
              </button>
              {user?.email ? (
                <p className="text-caption text-text-muted m-0 mt-0.5 break-all">{user.email}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "kind",
        header: "Asked to",
        sortValue: (row) => PRIVACY_KIND_LABEL[row.kind],
        cell: (row) => <span className="text-body text-text-primary">{PRIVACY_KIND_LABEL[row.kind]}</span>,
      },
      {
        id: "due",
        header: "Due",
        sortValue: (row) => row.dueAt,
        cell: (row) => {
          const chip = dueChip(row, now);
          return (
            <div className="flex flex-col items-start gap-1">
              {chip ? <StatusChip {...chip} /> : null}
              <span className="text-caption text-text-muted">
                {isOpenPrivacyRequest(row)
                  ? formatManilaDate(row.dueAt)
                  : `Closed ${formatManilaDate(row.updatedAt)}`}
              </span>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => row.status,
        cell: (row) => <StatusChip {...privacyStatusChip(row.status)} />,
      },
      {
        id: "handler",
        header: "Handled by",
        hideOnMobile: true,
        sortValue: (row) => nameOf(row.handlerId) ?? "",
        cell: (row) => (
          <span className={row.handlerId ? "text-body text-text-secondary" : "text-body text-text-muted"}>
            {nameOf(row.handlerId) ?? "Nobody yet"}
          </span>
        ),
      },
    ],
    // setParam reads the current URL each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nameOf, people, now, params],
  );

  if (error && !rows) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-2">
          <p className="text-body text-text-secondary m-0">
            Requests from See my data, Correct my data and Delete my account in
            the apps. Nothing happens on its own: confirm it is really them, do
            it by hand, then write down what you did. They read your answer in
            their app.
          </p>
          <p className="text-caption text-text-muted m-0">
            Due dates default to 15 days after the request and are GRIDGO&apos;s
            own target. Older deletion requests from the website stay in{" "}
            <Link href={`/${tree}/account-deletion`} className="underline underline-offset-4">
              Account deletion
            </Link>
            .
          </p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <ToggleGroup
          aria-label="Which requests"
          value={[filter]}
          onValueChange={(values) => {
            const next = values[0];
            if (isFilter(next ?? null)) setParam("show", next === "open" ? null : next);
          }}
          variant="outline"
        >
          {PRIVACY_FILTERS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {filter === "open" && rows ? (
          <p className="text-body text-text-secondary m-0" role="status">
            {openRows.length === 0
              ? "Nothing open."
              : [
                  `${openRows.length} open`,
                  overdue ? `${overdue} overdue` : null,
                  unassigned ? `${unassigned} with nobody handling ${unassigned === 1 ? "it" : "them"}` : null,
                ]
                  .filter(Boolean)
                  .join(", ") + "."}
          </p>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={list}
        loading={loading && !rows}
        getRowId={(row) => row.id}
        caption="Privacy requests"
        itemLabel="requests"
        pageSize={25}
        filterPlaceholder="Find a requester…"
        rowActions={(row) => (
          <DataTableRowAction
            label={`Open ${PRIVACY_KIND_LABEL[row.kind]} from ${nameOf(row.userId)}`}
            icon={PanelRightOpen}
            onClick={() => setParam("request", row.id)}
          />
        )}
        empty={
          <EmptyState
            title={filter === "open" ? "No open requests" : "No requests here"}
            body={
              filter === "open"
                ? "When someone taps See my data, Correct my data or Delete my account, the request lands here."
                : "Requests move here once someone completes or declines them."
            }
          />
        }
      />
      {capped ? (
        <p className="text-caption text-text-muted m-0">
          Showing the first {MAX_PAGES * 100} requests. Narrow the view to see the rest.
        </p>
      ) : null}

      <PrivacyRequestSheet
        tree={tree}
        request={selected}
        requester={selected ? people.get(selected.userId) ?? null : null}
        staff={staff}
        now={now}
        onClose={() => setParam("request", null)}
        onSaved={(updated) => {
          setRows((current) =>
            current ? sortPrivacyRequests(current.map((row) => (row.id === updated.id ? updated : row))) : current,
          );
          void load();
        }}
        onStale={() => void load()}
      />
    </div>
  );
}
