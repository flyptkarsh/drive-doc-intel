"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { EmptyState } from "@/components/common/empty-state";
import { RowsSkeleton } from "@/components/common/rows-skeleton";
import { swrFetcher } from "@/lib/fetcher";
import type { PerformanceResponse, PerformanceRow } from "@/lib/types";
import { MonthlyGrid } from "./monthly-grid";
import {
  ALL,
  DEFAULT_FILTERS,
  PerformanceFilters,
  type Filters,
  type ViewMode,
} from "./performance-filters";
import { PerformanceTable } from "./performance-table";

function performanceUrl({ fund, periodType, from, to }: Filters): string {
  const params = new URLSearchParams();
  if (fund !== ALL) params.set("fund", fund);
  if (periodType !== ALL) params.set("period_type", periodType);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/api/performance?${params}`;
}

function matchesText(row: PerformanceRow, text: string): boolean {
  return [
    row.fund_name,
    row.share_class,
    row.period_label,
    row.document_name,
    row.manager,
    row.benchmark_name,
  ].some((value) => value?.toLowerCase().includes(text));
}

export function PerformanceView() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<ViewMode>("table");
  const { data } = useSWR<PerformanceResponse>(performanceUrl(filters), swrFetcher, {
    keepPreviousData: true,
  });

  const rows = useMemo(() => {
    const text = filters.text.trim().toLowerCase();
    const all = data?.rows ?? [];
    return text ? all.filter((row) => matchesText(row, text)) : all;
  }, [data, filters.text]);

  return (
    <div className="space-y-4">
      <PerformanceFilters
        filters={filters}
        onChange={setFilters}
        funds={data?.funds ?? []}
        mode={mode}
        onModeChange={setMode}
      />
      {!data ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState>
          No performance data yet. It appears here as documents finish processing.
        </EmptyState>
      ) : mode === "grid" ? (
        <MonthlyGrid rows={rows} />
      ) : (
        <PerformanceTable rows={rows} />
      )}
    </div>
  );
}
