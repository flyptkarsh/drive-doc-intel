"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { RowsSkeleton } from "@/components/common/rows-skeleton";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiPost, swrFetcher } from "@/lib/fetcher";
import type { DocumentRow, SyncStatus } from "@/lib/types";
import { DocumentDialog } from "./document-dialog";
import { DocumentsTable } from "./documents-table";

export function DocumentsView() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useDebouncedValue(query.trim());
  const { data, mutate } = useSWR<{ documents: DocumentRow[] }>(
    `/api/documents${search ? `?q=${encodeURIComponent(search)}` : ""}`,
    swrFetcher,
    { keepPreviousData: true },
  );

  // From the status endpoint, not the (possibly search-filtered) list: retry covers every failure.
  const { data: status } = useSWR<SyncStatus>("/api/status", swrFetcher);
  const { mutate: mutateGlobal } = useSWRConfig();
  const failedCount = status?.counts.error ?? 0;

  const retryFailed = async () => {
    try {
      const { queued } = await apiPost<{ queued: number }>("/api/documents/retry-failed");
      toast.success(`Retrying ${queued} ${queued === 1 ? "document" : "documents"}`);
      void mutate();
      void mutateGlobal("/api/status");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="max-w-md flex-1"
          placeholder="Search document text, managers, funds…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search documents"
        />
        {failedCount > 0 && (
          <Button variant="outline" onClick={retryFailed} className="ml-auto">
            <RefreshCw /> Retry {failedCount} failed
          </Button>
        )}
      </div>
      {!data ? (
        <RowsSkeleton rows={6} rowClassName="h-10" />
      ) : data.documents.length === 0 ? (
        <EmptyState>
          {search ? "No documents match." : "No documents yet. Drop files into your Drive folder."}
        </EmptyState>
      ) : (
        <DocumentsTable documents={data.documents} onSelect={setSelectedId} />
      )}
      <DocumentDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
