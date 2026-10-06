import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RowsSkeleton({
  rows = 8,
  rowClassName = "h-8",
}: {
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <Card className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </Card>
  );
}
