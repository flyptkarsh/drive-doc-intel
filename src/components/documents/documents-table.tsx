import { FileText } from "lucide-react";
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
import { formatDate, humanize } from "@/lib/format";
import type { DocumentRow } from "@/lib/types";
import { DocumentStatusBadge } from "./document-status-badge";

export function DocumentsTable({
  documents,
  onSelect,
}: {
  documents: DocumentRow[];
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Document</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Manager</TableHead>
            <TableHead>As of</TableHead>
            <TableHead className="text-right">Data points</TableHead>
            <TableHead className="pr-4">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow key={doc.id} className="cursor-pointer" onClick={() => onSelect(doc.id)}>
              <TableCell className="max-w-80 pl-4">
                <button
                  className="flex w-full items-center gap-2 text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(doc.id);
                  }}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{doc.title ?? doc.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{doc.name}</span>
                  </span>
                </button>
              </TableCell>
              <TableCell>
                {doc.document_type ? (
                  <Badge variant="outline">{humanize(doc.document_type)}</Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="max-w-40 truncate">{doc.manager ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(doc.as_of_date)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {doc.status === "done" ? doc.performance_count + doc.metric_count : "—"}
              </TableCell>
              <TableCell className="pr-4">
                <DocumentStatusBadge status={doc.status} error={doc.error} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
