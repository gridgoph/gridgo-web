"use client";

import { useState } from "react";

import { toast } from "@/components/ui/toast";
import { downloadAuditCsv } from "@/lib/api/client";
import { auditCsvFilename, auditErrorMessage, exportUpperBound, type AuditQuery } from "@/lib/audit";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Export the log as the API's CSV, every page, with the same filters as the
 * screen. The upper time bound is fixed once at the start so entries written
 * during the export cannot shift the pages.
 */
export function useAuditExport() {
  const [exporting, setExporting] = useState(false);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function exportCsv(query: AuditQuery, orderId?: string) {
    setExporting(true);
    setPages(0);
    setError(null);
    try {
      const blob = await downloadAuditCsv(
        { ...query, to: exportUpperBound(query) },
        { orderId, onPage: setPages },
      );
      saveBlob(blob, auditCsvFilename(orderId));
      toast.add({
        type: "success",
        title: "CSV downloaded",
        description: "It holds every entry that matches, up to the moment the export started.",
      });
    } catch (err) {
      setError(auditErrorMessage(err, "The CSV could not be made. Try again."));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, pages, error, exportCsv };
}
