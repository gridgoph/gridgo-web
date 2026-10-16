"use client";

/**
 * The service fee brackets for Operations, read-only (gridgo-api#220: "Super
 * Admin only in Operational Settings, Operations can view"). Operational
 * settings stay Super Admin's screen (gridgo-web#112); this card is the one
 * part of them Operations reads, under the "Super Admin only" notice at
 * `/ops/settings`. Every order's own working is on its workspace Money card.
 */

import { useCallback, useEffect, useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { ServiceFeeBrackets } from "@/components/settings/ServiceFeeBrackets";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { getSettings } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { hasBracketSettings } from "@/lib/service-fee-brackets";

export function ServiceFeeView() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await getSettings());
      setError(null);
    } catch (err) {
      setError(opsErrorMessage(err, "Could not load the service fee. Try again."));
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
  if (!settings) return <LoadingBlock label="Loading the service fee…" />;
  // An API from before brackets holds one rate, which Operations reads on each order.
  if (!hasBracketSettings(settings)) return null;
  return <ServiceFeeBrackets settings={settings} canEdit={false} />;
}
