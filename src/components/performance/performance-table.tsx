"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { ReturnCell } from "@/components/common/return-cell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatPct } from "@/lib/format";
import type { PerformanceRow } from "@/lib/types";

const MAX_VISIBLE_ROWS = 1000;

type SortKey = "fund_name" | "period_end" | "return_pct" | "excess";
type Sort = { key: SortKey; dir: 1 | -1 };

const excessReturn = (r: PerformanceRow) =>
  r.benchmark_return_pct === null ? null : r.return_pct - r.benchmark_return_pct;

function sortValue(row: PerformanceRow, key: SortKey): string | number {
  switch (key) {
    case "excess":
      return excessReturn(row) ?? -Infinity;
    case "period_end":
      return row.period_end ?? "";
    case "return_pct":
      return row.return_pct;
    case "fund_name":
      return row.fund_name.toLowerCase();
  }
}

export function PerformanceTable({ rows }: { rows: PerformanceRow[] }) {
  const [sort, setSort] = useState<Sort>({ key: "period_end", dir: -1 });

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const [x, y] = [sortValue(a, sort.key), sortValue(b, sort.key)];
        return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      }),
    [rows, sort],
  );

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 1 ? -1 : 1 }
        : { key, dir: key === "fund_name" ? 1 : -1 },
    );

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead column="fund_name" sort={sort} onSort={toggleSort} className="pl-4">
              Fund
            </SortableHead>
            <TableHead>Period</TableHead>
            <SortableHead column="period_end" sort={sort} onSort={toggleSort}>
              Period end
            </SortableHead>
            <SortableHead
              column="return_pct"
              sort={sort}
              onSort={toggleSort}
              className="text-right"
            >
              Return
            </SortableHead>
            <TableHead className="text-right">Benchmark</TableHead>
            <SortableHead column="excess" sort={sort} onSort={toggleSort} className="text-right">
              Excess
            </SortableHead>
            <TableHead className="pr-4">Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.slice(0, MAX_VISIBLE_ROWS).map((row) => (
            <PerformanceTableRow key={row.id} row={row} />
          ))}
        </TableBody>
      </Table>
      {sorted.length > MAX_VISIBLE_ROWS && (
        <p className="border-t p-3 text-center text-xs text-muted-foreground">
          Showing {MAX_VISIBLE_ROWS.toLocaleString()} of {sorted.length.toLocaleString()} rows.
          Narrow the filters to see more.
        </p>
      )}
    </Card>
  );
}

function PerformanceTableRow({ row }: { row: PerformanceRow }) {
  return (
    <TableRow>
      <TableCell className="max-w-72 pl-4">
        <div className="truncate font-medium">{row.fund_name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[row.share_class, row.manager].filter(Boolean).join(" · ") || "—"}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {row.period_label}
          {row.is_annualized && (
            <Badge variant="outline" className="text-[10px]">
              ann.
            </Badge>
          )}
          {row.net_or_gross === "gross" && (
            <Badge variant="outline" className="text-[10px]">
              gross
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{formatDate(row.period_end)}</TableCell>
      <ReturnCell value={row.return_pct} />
      <TableCell className="text-right">
        <div className="font-mono tabular-nums">{formatPct(row.benchmark_return_pct)}</div>
        {row.benchmark_name && (
          <div
            className="max-w-40 truncate text-xs text-muted-foreground"
            title={row.benchmark_name}
          >
            {row.benchmark_name}
          </div>
        )}
      </TableCell>
      <ReturnCell value={excessReturn(row)} />
      <TableCell className="max-w-48 pr-4">
        {row.web_view_link ? (
          <a
            href={row.web_view_link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">{row.document_name}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        ) : (
          <span className="truncate text-xs text-muted-foreground">{row.document_name}</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function SortableHead({
  column,
  sort,
  onSort,
  className,
  children,
}: {
  column: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort.key === column;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
    >
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {children}
        {active &&
          (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );
}
