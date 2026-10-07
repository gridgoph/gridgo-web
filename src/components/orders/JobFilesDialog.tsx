"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { DesignLinkLead, DesignLinkList } from "@/components/orders/DesignLinks";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Order } from "@/lib/api/types";
import { orderDesignLinks } from "@/lib/design-links";
import { jobFileEvidence } from "@/lib/evidence";

/** The shop's own files, with one preview and one yellow download at a time. */
export function JobFilesDialog({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { artwork, mockups } = jobFileEvidence(order);
  const files = [...artwork, ...mockups];
  const links = orderDesignLinks(order);
  const selected = files.find((file) => file.fileId === selectedId) ?? files[0];

  if (!files.length && !links.length) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto sm:min-w-40"
          />
        }
      >
        <Download data-icon="inline-start" aria-hidden />
        Download files
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Download files</DialogTitle>
          <DialogDescription>
            Preview the artwork and mockups for this job, then save the file you need.
          </DialogDescription>
        </DialogHeader>
        {files.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a file">
            {files.map((file) => (
              <Button
                key={file.fileId}
                variant={file.fileId === selected?.fileId ? "default" : "secondary"}
                aria-pressed={file.fileId === selected?.fileId}
                className="h-auto min-h-12 max-w-full whitespace-normal text-left"
                onClick={() => setSelectedId(file.fileId)}
              >
                {file.label}
              </Button>
            ))}
          </div>
        ) : null}
        {selected ? (
          <EvidencePlate
            key={selected.fileId}
            fileId={selected.fileId}
            label={selected.label}
            caption={selected.caption}
            downloadable
            featuredDownload
          />
        ) : null}
        {links.length ? (
          <div className="flex flex-col gap-2">
            <DesignLinkLead fileToo={artwork.length > 0} />
            <DesignLinkList links={links} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
