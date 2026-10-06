import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DocumentStatus } from "@/lib/types";

export function DocumentStatusBadge({
  status,
  error,
}: {
  status: DocumentStatus;
  error?: string | null;
}) {
  switch (status) {
    case "done":
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="size-3 text-emerald-600" /> Extracted
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" /> Processing
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1" title={error ?? undefined}>
          <AlertCircle className="size-3" /> Failed
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="size-3" /> Queued
        </Badge>
      );
  }
}
