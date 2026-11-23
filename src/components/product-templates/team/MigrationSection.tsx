"use client";

import { useId, useMemo, useState } from "react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/StatusChip";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { applyShopMigration, previewShopMigration } from "@/lib/api/product-templates";
import { formatPhp } from "@/lib/format";
import {
  expectedVersionsOf,
  isOpenOrderSkip,
  migrationActionLine,
  migrationManualLine,
  normalizeMigrationPlan,
  type MigrationPlan,
  type ProductTemplate,
} from "@/lib/product-templates";

import { migrationChoices, migrationErrorMessage, type MergeDraft } from "./team-logic";

type Product = { id: string; name: string };

/** The plan split three ways: what changes, what open orders protect, what needs a person. */
export function splitPlan(plan: MigrationPlan) {
  return {
    changes: plan.actions,
    openOrders: plan.manual.filter((m) => isOpenOrderSkip(m.reason)),
    manual: plan.manual.filter((m) => !isOpenOrderSkip(m.reason)),
  };
}

/**
 * Match a shop's existing products to templates (gridgo-supplier#268). Always
 * a read-only preview first; Apply re-sends the same choices with the version
 * of every product the preview would change. Products with open orders are
 * listed as skipped and never changed; there is no override.
 */
export function MigrationSection({
  supplierId,
  shopName,
  products,
  templates,
  onApplied,
}: {
  supplierId: string;
  shopName: string;
  products: Product[];
  templates: ProductTemplate[];
  onApplied: (message: string) => void;
}) {
  const id = useId();
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [merges, setMerges] = useState<MergeDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState<MigrationPlan | null>(null);

  const choices = useMemo(() => migrationChoices(matches, merges), [matches, merges]);
  const key = JSON.stringify(choices);
  const stale = plan != null && previewedKey !== key;
  const nameOf = (itemId: string) =>
    products.find((p) => p.id === itemId)?.name || "Untitled product";
  const templateName = (tid: string | null) =>
    templates.find((t) => t.id === tid)?.name ?? "a template";
  const split = plan ? splitPlan(plan) : null;

  async function preview() {
    setBusy(true);
    setError(null);
    setApplied(null);
    try {
      setPlan(normalizeMigrationPlan(await previewShopMigration(supplierId, choices)));
      setPreviewedKey(key);
    } catch (err) {
      setError(
        migrationErrorMessage(err) ??
          opsErrorMessage(err, "Could not preview. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const result = normalizeMigrationPlan(
        await applyShopMigration(supplierId, choices, expectedVersionsOf(plan)),
      );
      setConfirming(false);
      setApplied(result);
      setPlan(null);
      setMerges([]);
      setMatches({});
      onApplied(
        `Applied ${result.actions.length} change${result.actions.length === 1 ? "" : "s"} to ${shopName}. The shop is asked to check its products.`,
      );
    } catch (err) {
      setConfirming(false);
      setError(
        migrationErrorMessage(err) ??
          opsErrorMessage(err, "Could not apply. Preview again, then apply."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="gg-card flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-h3 text-text-primary m-0">
          Match existing products to templates
        </h2>
        <p className="text-body text-text-secondary m-0 max-w-2xl">
          Preview first: nothing changes until you apply. Exact copies are hidden, ₱0
          products are hidden until priced, and nothing is deleted. Products with open
          orders are never changed.
        </p>
      </div>

      <MergeBuilder products={products} merges={merges} onChange={setMerges} />

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => void preview()}>
          {busy && !confirming ? "Checking" : plan ? "Preview again" : "Preview changes"}
        </Button>
        {plan && !stale ? (
          <Button
            disabled={busy || !plan.actions.length}
            onClick={() => setConfirming(true)}
          >
            Apply {plan.actions.length} change{plan.actions.length === 1 ? "" : "s"}
          </Button>
        ) : null}
        {stale ? (
          <p className="text-caption text-text-muted m-0">
            Your choices changed. Preview again to apply.
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-body text-destructive m-0">
          {error}
        </p>
      ) : null}

      {applied ? (
        <PlanList
          title={`Applied (${applied.actions.length})`}
          items={applied.actions.map((a) => ({
            id: a.itemId,
            name: nameOf(a.itemId),
            line: migrationActionLine(a, templateName),
          }))}
          tone="success"
          empty="Nothing needed changing."
        />
      ) : null}

      {split ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <PlanList
            title={`Will change (${split.changes.length})`}
            tone="info"
            empty="Nothing to change."
            items={split.changes.map((a) => ({
              id: a.itemId,
              name: nameOf(a.itemId),
              line: migrationActionLine(a, templateName),
              extra: a.variants.length
                ? a.variants
                    .map((v) => `${v.label}: ${formatPhp(v.priceMinor)}`)
                    .join(", ")
                : undefined,
            }))}
          />
          <PlanList
            title={`Skipped: open orders (${split.openOrders.length})`}
            tone="warning"
            empty="No product here has open orders."
            items={split.openOrders.map((m) => ({
              id: m.itemId,
              name: nameOf(m.itemId),
              line: migrationManualLine(m.reason),
            }))}
          />
          <div className="flex flex-col gap-2">
            <h3
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Needs a person ({split.manual.length})
            </h3>
            {split.manual.length ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {split.manual.map((m) => (
                  <li key={`${m.itemId}:${m.reason}`} className="flex flex-col gap-1">
                    <span className="text-body text-text-primary">
                      {nameOf(m.itemId)}
                    </span>
                    <span className="text-caption text-text-secondary">
                      {migrationManualLine(m.reason)}
                    </span>
                    {m.reason === "ambiguous_template" && m.templateIds.length ? (
                      <Select
                        value={matches[m.itemId] ?? ""}
                        onValueChange={(v) =>
                          setMatches((c) => ({
                            ...c,
                            [m.itemId]: typeof v === "string" ? v : "",
                          }))
                        }
                      >
                        <SelectTrigger
                          className="min-h-11 w-full"
                          aria-label={`Template for ${nameOf(m.itemId)}`}
                        >
                          <SelectValue>
                            {(v) => (v ? templateName(String(v)) : "Choose its template")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {m.templateIds.map((tid) => (
                              <SelectItem key={tid} value={tid}>
                                {templateName(tid)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-text-secondary m-0">Nothing.</p>
            )}
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply {plan?.actions.length} change{plan?.actions.length === 1 ? "" : "s"}{" "}
              to {shopName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Exactly these products change. Nothing is deleted, and the shop is asked to
              check its products.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {split ? (
            <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {split.changes.map((a) => (
                  <li key={a.itemId} className="text-body text-text-primary">
                    {nameOf(a.itemId)}:{" "}
                    <span className="text-text-secondary">
                      {migrationActionLine(a, templateName)}
                    </span>
                  </li>
                ))}
              </ul>
              {split.openOrders.length ? (
                <p className="text-body text-text-secondary m-0">
                  Not changed, open orders:{" "}
                  {split.openOrders.map((m) => nameOf(m.itemId)).join(", ")}.
                </p>
              ) : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void apply()}>
              {busy ? "Applying" : "Apply changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function PlanList({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: { id: string; name: string; line: string; extra?: string }[];
  tone: "info" | "warning" | "success";
  empty: string;
}) {
  const icon =
    tone === "warning" ? "ban" : tone === "success" ? "circle-check" : "square-pen";
  return (
    <div className="flex flex-col gap-2">
      <h3
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {title}
      </h3>
      {items.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <StatusChip tone={tone} icon={icon} label={item.name} />
              </span>
              <span className="text-caption text-text-secondary">{item.line}</span>
              {item.extra ? (
                <span className="text-caption text-text-muted tabular-nums">
                  {item.extra}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0">{empty}</p>
      )}
    </div>
  );
}

/**
 * Optional: products that are really one product in several sizes (an A4
 * flyer and an A3 flyer) become one product with each as an option. The API
 * only merges simple, identical-setup products and says why otherwise.
 */
function MergeBuilder({
  products,
  merges,
  onChange,
}: {
  products: Product[];
  merges: MergeDraft[];
  onChange: (merges: MergeDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const inMerge = new Set(merges.flatMap((m) => [m.keepId, ...m.sourceIds]));
  const free = products.filter((p) => !inMerge.has(p.id));
  const nameOf = (pid: string) =>
    products.find((p) => p.id === pid)?.name || "Untitled product";

  return (
    <div className="flex flex-col gap-2">
      {merges.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {merges.map((m, index) => (
            <li
              key={m.keepId}
              className="text-body text-text-primary flex flex-wrap items-center gap-2"
            >
              Merge into {nameOf(m.keepId)}:{" "}
              {[m.keepId, ...m.sourceIds]
                .map((pid) => m.labels[pid] || nameOf(pid))
                .join(", ")}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(merges.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-field)] border border-outline p-3">
          <p className="text-body text-text-secondary m-0">
            Tick the products to merge. The first ticked one stays; the others become its
            options and are hidden.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {free.map((p) => {
              const on = picked.includes(p.id);
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_14rem]"
                >
                  <Checkbox
                    aria-label={`Merge ${p.name}`}
                    checked={on}
                    onCheckedChange={(v) =>
                      setPicked((c) =>
                        v === true ? [...c, p.id] : c.filter((x) => x !== p.id),
                      )
                    }
                  />
                  <span className="text-body text-text-primary min-w-0 truncate">
                    {p.name || "Untitled product"}
                    {picked[0] === p.id ? (
                      <span className="text-text-muted"> (stays)</span>
                    ) : null}
                  </span>
                  {on ? (
                    <Input
                      aria-label={`Option name for ${p.name}`}
                      placeholder="Option name, e.g. A4"
                      value={labels[p.id] ?? ""}
                      maxLength={100}
                      onChange={(e) =>
                        setLabels((c) => ({ ...c, [p.id]: e.target.value }))
                      }
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={picked.length < 2}
              onClick={() => {
                const [keepId, ...sourceIds] = picked;
                onChange([
                  ...merges,
                  {
                    keepId: keepId!,
                    sourceIds,
                    labels: Object.fromEntries(
                      picked
                        .filter((pid) => labels[pid]?.trim())
                        .map((pid) => [pid, labels[pid]!.trim()]),
                    ),
                  },
                ]);
                setPicked([]);
                setLabels({});
                setOpen(false);
              }}
            >
              Add this merge
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="self-start"
          disabled={free.length < 2}
          onClick={() => setOpen(true)}
        >
          Merge products into one with options
        </Button>
      )}
    </div>
  );
}
