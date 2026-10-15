"use client";

/**
 * Artwork guidance for the GRIDGO Team, read-only, under the "Super Admin
 * only" notice at `/ops/settings`. The API lets every role read the targets
 * and answers anyone but Super Admin `403` on a change, so this draws the
 * same table without inputs. Each order keeps the target it was checked
 * against on its own workspace.
 */

import { useCallback, useEffect, useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { ArtworkGuidanceSettings } from "@/components/settings/ArtworkGuidanceSettings";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { getSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";

export function ArtworkGuidanceView() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await getSettings());
      setError(null);
    } catch (err) {
      setError(opsErrorMessage(err, "Could not load artwork guidance. Try again."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload("settings", load);

  if (error && !settings) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (!settings) return <LoadingBlock label="Loading artwork guidance…" />;
  // An API from before artwork guidance has nothing for the GRIDGO Team to read.
  if (!settings.artworkGuidance) return null;
  return <ArtworkGuidanceSettings settings={settings} canEdit={false} />;
}
