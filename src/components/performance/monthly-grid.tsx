import { EmptyState } from "@/components/common/empty-state";
import { ReturnCell } from "@/components/common/return-cell";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PerformanceRow } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type YearGrid = { year: string; funds: { name: string; months: (number | undefined)[] }[] };

/** Groups monthly returns into year → fund → 12 monthly values. */
export function buildMonthlyGrid(rows: PerformanceRow[]): YearGrid[] {
  const years = new Map<string, Map<string, (number | undefined)[]>>();
  for (const row of rows) {
    if (row.period_type !== "month" || !row.period_end) continue;
    const year = row.period_end.slice(0, 4);
    const month = Number(row.period_end.slice(5, 7)) - 1;
    const fund = [row.fund_name, row.share_class].filter(Boolean).join(" — ");
    const funds = years.get(year) ?? new Map();
    const months = funds.get(fund) ?? Array<number | undefined>(12).fill(undefined);
    months[month] = row.return_pct;
    funds.set(fund, months);
    years.set(year, funds);
  }
  return [...years.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, funds]) => ({
      year,
      funds: [...funds.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, months]) => ({ name, months })),
    }));
}

/** Fund × month pivot of monthly returns, one table per year. */
export function MonthlyGrid({ rows }: { rows: PerformanceRow[] }) {
  const grid = buildMonthlyGrid(rows);
  if (grid.length === 0)
    return <EmptyState>No monthly returns in the current selection.</EmptyState>;

  return (
    <div className="space-y-4">
      {grid.map(({ year, funds }) => (
        <Card key={year} className="overflow-hidden p-0">
          <h3 className="border-b px-4 py-2 text-sm font-medium">{year}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Fund</TableHead>
                {MONTHS.map((month) => (
                  <TableHead key={month} className="text-right">
                    {month}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {funds.map(({ name, months }) => (
                <TableRow key={name}>
                  <TableCell className="max-w-64 truncate pl-4 font-medium" title={name}>
                    {name}
                  </TableCell>
                  {months.map((value, i) =>
                    value === undefined ? (
                      <TableCell
                        key={i}
                        className="text-right text-muted-foreground/40"
                        aria-label="No data"
                      >
                        ·
                      </TableCell>
                    ) : (
                      <ReturnCell key={i} value={value} digits={1} className="text-xs" />
                    ),
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
