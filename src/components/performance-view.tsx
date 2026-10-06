"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Grid3x3, Rows3, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, date, humanize, pct, returnClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PerformanceRow } from "./types";

const PERIODS = ["month", "quarter", "ytd", "1y", "3y", "5y", "10y", "since_inception", "calendar_year", "other"];
const PERIOD_LABEL: Record<string, string> = { ytd: "YTD", "1y": "1 year", "3y": "3 years", "5y": "5 years", "10y": "10 years" };
type SortKey = "fund_name" | "period_end" | "return_pct" | "excess";

export function PerformanceView({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<PerformanceRow[] | null>(null);
  const [funds, setFunds] = useState<string[]>([]);
  const [fund, setFund] = useState<string>("all");
  const [period, setPeriod] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"table" | "grid">("table");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "period_end", dir: -1 });

  useEffect(() => {
    const p = new URLSearchParams();
    if (fund !== "all") p.set("fund", fund);
    if (period !== "all") p.set("period_type", period);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    api<{ rows: PerformanceRow[]; funds: string[] }>(`/api/performance?${p}`)
      .then((r) => {
        setRows(r.rows);
        setFunds(r.funds);
      })
      .catch(() => setRows([]));
  }, [fund, period, from, to, refreshKey]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const t = text.trim().toLowerCase();
    const list = t
      ? rows.filter((r) =>
          [r.fund_name, r.share_class, r.period_label, r.document_name, r.manager, r.benchmark_name]
            .some((v) => v?.toLowerCase().includes(t)),
        )
      : rows;
    const val = (r: PerformanceRow): string | number =>
      sort.key === "excess"
        ? r.benchmark_return_pct === null ? -Infinity : r.return_pct - r.benchmark_return_pct
        : sort.key === "period_end" ? r.period_end ?? ""
        : sort.key === "return_pct" ? r.return_pct
        : r.fund_name;
    return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [rows, text, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "fund_name" ? 1 : -1 }));

  const fundItems = [{ value: "all", label: "All funds" }, ...funds.map((f) => ({ value: f, label: f }))];
  const periodItems = [{ value: "all", label: "All periods" }, ...PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] ?? humanize(p) }))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input placeholder="Filter rows…" value={text} onChange={(e) => setText(e.target.value)} className="pl-8" />
        </div>
        <Select items={fundItems} value={fund} onValueChange={(v) => setFund((v as string) ?? "all")}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {fundItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select items={periodItems} value={period} onValueChange={(v) => setPeriod((v as string) ?? "all")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {periodItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-38" aria-label="Period ending from" />
        <span className="text-muted-foreground text-sm">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-38" aria-label="Period ending to" />
        <div className="ml-auto flex rounded-lg border p-0.5">
          <Button size="sm" variant={mode === "table" ? "secondary" : "ghost"} onClick={() => setMode("table")}><Rows3 /> Table</Button>
          <Button size="sm" variant={mode === "grid" ? "secondary" : "ghost"} onClick={() => setMode("grid")}><Grid3x3 /> Monthly grid</Button>
        </div>
      </div>

      {rows === null ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8" />)}</Card>
      ) : filtered.length === 0 ? (
        <Card className="text-muted-foreground p-12 text-center text-sm">
          No performance data yet. It appears here as documents finish processing.
        </Card>
      ) : mode === "grid" ? (
        <MonthlyGrid rows={filtered} />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead sort={sort} onSort={toggleSort} k="fund_name" className="pl-4">Fund</SortHead>
                <TableHead>Period</TableHead>
                <SortHead sort={sort} onSort={toggleSort} k="period_end">Period end</SortHead>
                <SortHead sort={sort} onSort={toggleSort} k="return_pct" className="text-right">Return</SortHead>
                <TableHead className="text-right">Benchmark</TableHead>
                <SortHead sort={sort} onSort={toggleSort} k="excess" className="text-right">Excess</SortHead>
                <TableHead className="pr-4">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 1000).map((r) => {
                const excess = r.benchmark_return_pct === null ? null : r.return_pct - r.benchmark_return_pct;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-72 pl-4">
                      <div className="truncate font-medium">{r.fund_name}</div>
                      <div className="text-muted-foreground truncate text-xs">
                        {[r.share_class, r.manager].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {r.period_label}
                        {r.is_annualized && <Badge variant="outline" className="text-[10px]">ann.</Badge>}
                        {r.net_or_gross === "gross" && <Badge variant="outline" className="text-[10px]">gross</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{date(r.period_end)}</TableCell>
                    <TableCell className={cn("text-right font-mono tabular-nums", returnClass(r.return_pct))}>{pct(r.return_pct)}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-mono tabular-nums">{pct(r.benchmark_return_pct)}</div>
                      {r.benchmark_name && <div className="text-muted-foreground max-w-40 truncate text-xs" title={r.benchmark_name}>{r.benchmark_name}</div>}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono tabular-nums", returnClass(excess))}>{pct(excess)}</TableCell>
                    <TableCell className="max-w-48 pr-4">
                      <a href={r.web_view_link ?? "#"} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground flex items-center gap-1 truncate text-xs">
                        <span className="truncate">{r.document_name}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length > 1000 && (
            <p className="text-muted-foreground border-t p-3 text-center text-xs">Showing 1,000 of {filtered.length.toLocaleString()} rows. Narrow the filters to see more.</p>
          )}
        </Card>
      )}
    </div>
  );
}

function SortHead({ k, sort, onSort, children, className }: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button className="hover:text-foreground inline-flex items-center gap-1" onClick={() => onSort(k)}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Fund × month pivot of monthly returns, one block per year. */
function MonthlyGrid({ rows }: { rows: PerformanceRow[] }) {
  const monthly = rows.filter((r) => r.period_type === "month" && r.period_end);
  const years = [...new Set(monthly.map((r) => r.period_end!.slice(0, 4)))].sort().reverse();
  if (monthly.length === 0) {
    return <Card className="text-muted-foreground p-12 text-center text-sm">No monthly returns in the current selection.</Card>;
  }
  return (
    <div className="space-y-4">
      {years.map((year) => {
        const yr = monthly.filter((r) => r.period_end!.startsWith(year));
        const keys = [...new Set(yr.map((r) => [r.fund_name, r.share_class].filter(Boolean).join(" — ")))].sort();
        const cell = new Map<string, number>();
        for (const r of yr) {
          const k = [r.fund_name, r.share_class].filter(Boolean).join(" — ");
          cell.set(`${k}|${Number(r.period_end!.slice(5, 7)) - 1}`, r.return_pct);
        }
        return (
          <Card key={year} className="overflow-hidden p-0">
            <div className="border-b px-4 py-2 text-sm font-medium">{year}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Fund</TableHead>
                  {MONTHS.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k}>
                    <TableCell className="max-w-64 truncate pl-4 font-medium" title={k}>{k}</TableCell>
                    {MONTHS.map((_, i) => {
                      const v = cell.get(`${k}|${i}`);
                      return (
                        <TableCell key={i} className={cn("text-right font-mono text-xs tabular-nums", returnClass(v))}>
                          {v === undefined ? <span className="text-muted-foreground/40">·</span> : pct(v, 1)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
