"use client";

import { useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/common/empty-state";
import { RowsSkeleton } from "@/components/common/rows-skeleton";
import { SearchInput } from "@/components/common/search-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { swrFetcher } from "@/lib/fetcher";
import type { DocumentRow } from "@/lib/types";
import { DocumentDialog } from "./document-dialog";
import { DocumentsTable } from "./documents-table";

export function DocumentsView() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useDebouncedValue(query.trim());
  const { data } = useSWR<{ documents: DocumentRow[] }>(
    `/api/documents${search ? `?q=${encodeURIComponent(search)}` : ""}`,
    swrFetcher,
    { keepPreviousData: true },
  );

  return (
    <div className="space-y-4">
      <SearchInput
        className="max-w-md"
        placeholder="Search document text, managers, funds…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search documents"
      />
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
