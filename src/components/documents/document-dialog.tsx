"use client";

import useSWR from "swr";
import { toast } from "sonner";
import { ExternalLink, RefreshCw } from "lucide-react";
import { ReturnCell } from "@/components/common/return-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiPost, swrFetcher } from "@/lib/fetcher";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import type { DocumentDetail } from "@/lib/types";
import { DocumentStatusBadge } from "./document-status-badge";

export function DocumentDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useSWR<DocumentDetail>(id ? `/api/documents/${id}` : null, swrFetcher, {
    onError: (err: Error) => toast.error(err.message),
  });
  const detail = data?.document.id === id ? data : undefined;

  const reextract = async () => {
    if (!id) return;
    try {
      await apiPost(`/api/documents/${id}`);
      toast.success("Re-extracting this document");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] sm:max-w-3xl">
        {detail ? (
          <DocumentDetailBody detail={detail} onReextract={reextract} />
        ) : (
          <div className="space-y-3" aria-busy="true">
            <DialogTitle className="sr-only">Loading document</DialogTitle>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24" />
            <Skeleton className="h-48" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DocumentDetailBody({
  detail,
  onReextract,
}: {
  detail: DocumentDetail;
  onReextract: () => void;
}) {
  const { document: doc, performance, metrics } = detail;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6">{doc.title ?? doc.name}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">
          <DocumentStatusBadge status={doc.status} />
          {doc.document_type && <Badge variant="outline">{humanize(doc.document_type)}</Badge>}
          {doc.manager && <span>{doc.manager}</span>}
          {doc.as_of_date && <span>· as of {formatDate(doc.as_of_date)}</span>}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[60vh] pr-3">
        <div className="space-y-5">
          {doc.error && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{doc.error}</p>
          )}
          {doc.summary && <p className="text-sm leading-relaxed">{doc.summary}</p>}

          {performance.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-medium">Performance ({performance.length})</h4>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-3">Fund</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Return</TableHead>
                      <TableHead className="pr-3 text-right">Benchmark</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performance.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-56 truncate pl-3">
                          {p.fund_name}
                          {p.share_class && (
                            <span className="text-muted-foreground"> · {p.share_class}</span>
                          )}
                        </TableCell>
                        <TableCell>{p.period_label}</TableCell>
                        <ReturnCell value={p.return_pct} />
                        <ReturnCell value={p.benchmark_return_pct} tone={false} className="pr-3" />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          {metrics.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-medium">Metrics ({metrics.length})</h4>
              <dl className="grid gap-2 sm:grid-cols-2">
                {metrics.map((m, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">
                      {humanize(m.name)}
                      {m.fund_name && ` · ${m.fund_name}`}
                    </dt>
                    <dd className="font-mono text-sm tabular-nums">
                      {m.value_number !== null
                        ? formatNumber(m.value_number)
                        : (m.value_text ?? "—")}{" "}
                      {m.unit && <span className="text-muted-foreground">{m.unit}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Raw extraction JSON</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(doc.extraction, null, 2)}
            </pre>
          </details>
        </div>
      </ScrollArea>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onReextract}>
          <RefreshCw /> Re-extract
        </Button>
        {doc.web_view_link && (
          <Button render={<a href={doc.web_view_link} target="_blank" rel="noreferrer" />}>
            <ExternalLink /> Open in Drive
          </Button>
        )}
      </div>
    </>
  );
}
