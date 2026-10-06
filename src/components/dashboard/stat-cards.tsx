import { Card, CardContent } from "@/components/ui/card";
import type { SyncStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatCards({ counts }: { counts: SyncStatus["counts"] }) {
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const inProgress = (counts.pending ?? 0) + (counts.processing ?? 0);
  const failed = counts.error ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Documents" value={total} />
      <Stat label="Extracted" value={counts.done ?? 0} />
      <Stat label="In progress" value={inProgress} pulse={inProgress > 0} />
      <Stat label="Failed" value={failed} danger={failed > 0} />
    </div>
  );
}

function Stat({
  label,
  value,
  pulse,
  danger,
}: {
  label: string;
  value: number;
  pulse?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {pulse && <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />}
          {label}
        </div>
        <div
          className={cn("mt-1 text-2xl font-semibold tabular-nums", danger && "text-destructive")}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
