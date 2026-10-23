"use client";

import { useState, type FormEvent } from "react";

import { checkTrackerIssueUrl, TRACKER_URL_EXAMPLE } from "@/components/issue-reports/tracker-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Common = {
  open: boolean;
  reference: string;
  busy: boolean;
  /** The server's refusal, already in plain words. */
  error: string | null;
  onCancel: () => void;
};

/** Super Admin's GitHub issue field; Operations never sees it. */
function TrackerField({
  value,
  onChange,
  error,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  required: boolean;
}) {
  return (
    <Field data-invalid={error ? true : undefined} className="gap-1">
      {/* Type and colour stay off merged primitives (AGENTS.md). */}
      <FieldLabel htmlFor="tracker-issue-url">
        <span className="text-caption text-text-secondary">
          {required ? "GitHub tracker issue" : "GitHub tracker issue (optional)"}
        </span>
      </FieldLabel>
      <Input
        id="tracker-issue-url"
        type="url"
        inputMode="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={TRACKER_URL_EXAMPLE}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "tracker-issue-url-error" : "tracker-issue-url-help"}
        maxLength={300}
      />
      {error ? (
        <FieldError id="tracker-issue-url-error">
          <span className="text-caption text-error">{error}</span>
        </FieldError>
      ) : (
        <FieldDescription id="tracker-issue-url-help">
          <span className="text-caption text-text-muted">
            {required
              ? "Paste the link of the issue this report was filed as, or linked to."
              : "Kept on the report after publishing. Clear it to drop the link."}
          </span>
        </FieldDescription>
      )}
    </Field>
  );
}

/**
 * Tracked, with the GitHub issue the report became (Super Admin). Operations
 * marks a report tracked in one press and never sees this dialog.
 */
export function TrackDialog({
  open,
  reference,
  busy,
  error,
  onCancel,
  storedUrl,
  onTrack,
}: Common & { storedUrl: string | null; onTrack: (url: string) => void }) {
  const [url, setUrl] = useState(storedUrl ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const check = checkTrackerIssueUrl(url);
    if (!check.ok) {
      setUrlError(check.error);
      return;
    }
    onTrack(check.url);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{storedUrl ? `GitHub issue for report ${reference}` : `Track report ${reference}`}</DialogTitle>
            <DialogDescription>
              Tracked means the team is working on it in a GitHub issue. The report moves to the Tracked tab.
            </DialogDescription>
          </DialogHeader>
          <TrackerField
            value={url}
            required
            error={urlError}
            onChange={(value) => {
              setUrl(value);
              setUrlError(null);
            }}
          />
          {error ? (
            <p role="alert" className="text-caption text-error m-0">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={busy}>
              {storedUrl ? "Save link" : "Mark tracked"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Published, with the date of the public reports page that covers it. The
 * date is free text and optional; it is what the team searches by later.
 */
export function PublishDialog({
  open,
  reference,
  busy,
  error,
  onCancel,
  storedDate,
  trackerLinks,
  storedUrl,
  onPublish,
}: Common & {
  storedDate: string;
  trackerLinks: boolean;
  storedUrl: string | null;
  onPublish: (input: { publishedIn: string | null; trackerIssueUrl?: string | null }) => void;
}) {
  const [date, setDate] = useState(storedDate);
  const [url, setUrl] = useState(storedUrl ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const publishedIn = date.trim() || null;
    // A link the field holds is kept; an emptied field drops a stored one.
    if (trackerLinks && (url.trim() || storedUrl)) {
      if (!url.trim()) {
        onPublish({ publishedIn, trackerIssueUrl: null });
        return;
      }
      const check = checkTrackerIssueUrl(url);
      if (!check.ok) {
        setUrlError(check.error);
        return;
      }
      onPublish({ publishedIn, trackerIssueUrl: check.url });
      return;
    }
    onPublish({ publishedIn });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Publish report {reference}</DialogTitle>
            <DialogDescription>
              Published means the fix or answer is out and the public reports page names this report. The report moves
              to the Published tab.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field className="gap-1">
              <FieldLabel htmlFor="published-in">
                <span className="text-caption text-text-secondary">Reports page date (optional)</span>
              </FieldLabel>
              <Input
                id="published-in"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                placeholder="For example 09-25-2026"
                maxLength={200}
                aria-describedby="published-in-help"
              />
              <FieldDescription id="published-in-help">
                <span className="text-caption text-text-muted">
                  The date on the reports page that lists it, written as on that page. Leave blank if it has none.
                </span>
              </FieldDescription>
            </Field>
            {trackerLinks ? (
              <TrackerField
                value={url}
                required={false}
                error={urlError}
                onChange={(value) => {
                  setUrl(value);
                  setUrlError(null);
                }}
              />
            ) : null}
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-caption text-error m-0">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              Mark published
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
