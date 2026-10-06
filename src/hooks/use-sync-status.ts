"use client";

import { useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { swrFetcher } from "@/lib/fetcher";
import type { SyncStatus } from "@/lib/types";

const FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 15_000;

function isBusy(status: SyncStatus | undefined): boolean {
  if (!status) return false;
  return status.syncing || (status.counts.pending ?? 0) + (status.counts.processing ?? 0) > 0;
}

/**
 * Polls /api/status (quickly while work is in flight) and revalidates the data
 * views whenever document counts or the last sync time change.
 */
export function useSyncStatus() {
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, mutate } = useSWR<SyncStatus>("/api/status", swrFetcher, {
    refreshInterval: (latest) => (isBusy(latest) ? FAST_POLL_MS : SLOW_POLL_MS),
  });

  const signature = data
    ? JSON.stringify([data.counts, data.connection?.last_synced_at, data.connection?.folder_id])
    : null;
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (signature === null || signature === lastSignature.current) return;
    lastSignature.current = signature;
    void mutateGlobal(
      (key) =>
        typeof key === "string" &&
        (key.startsWith("/api/performance") || key.startsWith("/api/documents")),
    );
  }, [signature, mutateGlobal]);

  return { status: data, busy: isBusy(data), refresh: mutate };
}
