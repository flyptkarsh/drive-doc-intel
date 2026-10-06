import { TableCell } from "@/components/ui/table";
import { formatPct, returnTone } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A right-aligned, colour-coded percentage table cell. */
export function ReturnCell({
  value,
  digits,
  className,
  tone = true,
}: {
  value: number | null | undefined;
  digits?: number;
  className?: string;
  tone?: boolean;
}) {
  return (
    <TableCell
      className={cn("text-right font-mono tabular-nums", tone && returnTone(value), className)}
    >
      {formatPct(value, digits)}
    </TableCell>
  );
}
