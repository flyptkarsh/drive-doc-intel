"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, ExternalLink, FileText, Loader2, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, date, humanize, num, pct, returnClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DocumentRow } from "./types";

function StatusBadge({ status, error }: { status: DocumentRow["status"]; error?: string | null }) {
  if (status === "done") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3 text-emerald-600" />Extracted</Badge>;
  if (status === "processing") return <Badge variant="secondary" className="gap-1"><Loader2 className="size-3 animate-spin" />Processing</Badge>;
  if (status === "error") return <Badge variant="destructive" className="gap-1" title={error ?? undefined}><AlertCircle className="size-3" />Failed</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock className="size-3" />Queued</Badge>;
}

export function DocumentsView({ refreshKey }: { refreshKey: number }) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ documents: DocumentRow[] }>(`/api/documents${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => setDocs(r.documents))
        .catch(() => setDocs([]));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input placeholder="Search document text, managers, funds…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>
      {docs === null ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</Card>
      ) : docs.length === 0 ? (
        <Card className="text-muted-foreground p-12 text-center text-sm">{q ? "No documents match." : "No documents yet. Drop files into your Drive folder."}</Card>
      ) : (
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
              {docs.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => setOpenId(d.id)}>
                  <TableCell className="max-w-80 pl-4">
                    <div className="flex items-center gap-2">
                      <FileText className="text-muted-foreground size-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d.title ?? d.name}</div>
                        <div className="text-muted-foreground truncate text-xs">{d.name}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{d.document_type ? <Badge variant="outline">{humanize(d.document_type)}</Badge> : "—"}</TableCell>
                  <TableCell className="max-w-40 truncate">{d.manager ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{date(d.as_of_date)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{d.status === "done" ? d.performance_count + d.metric_count : "—"}</TableCell>
                  <TableCell className="pr-4"><StatusBadge status={d.status} error={d.error} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <DocumentDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

type Detail = {
  document: DocumentRow & { extraction: unknown };
  performance: { fund_name: string; share_class: string | null; period_label: string; period_end: string | null; return_pct: number; benchmark_return_pct: number | null; benchmark_name: string | null }[];
  metrics: { fund_name: string | null; name: string; value_number: number | null; value_text: string | null; unit: string | null; as_of_date: string | null }[];
};

function DocumentDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState<{ id: string; detail: Detail } | null>(null);
  const detail = loaded && loaded.id === id ? loaded.detail : null;
  useEffect(() => {
    if (!id) return;
    api<Detail>(`/api/documents/${id}`)
      .then((detail) => setLoaded({ id, detail }))
      .catch((e) => toast.error(e.message));
  }, [id]);

  const reprocess = async () => {
    if (!id) return;
    await api(`/api/documents/${id}`, { method: "POST" }).catch((e) => toast.error(e.message));
    toast.success("Re-extracting this document");
    onClose();
  };

  const d = detail?.document;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] sm:max-w-3xl">
        {!d ? (
          <div className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">{d.title ?? d.name}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <StatusBadge status={d.status} />
                {d.document_type && <Badge variant="outline">{humanize(d.document_type)}</Badge>}
                {d.manager && <span>{d.manager}</span>}
                {d.as_of_date && <span>· as of {date(d.as_of_date)}</span>}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-5">
                {d.error && <p className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">{d.error}</p>}
                {d.summary && <p className="text-sm leading-relaxed">{d.summary}</p>}
                {detail.performance.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-sm font-medium">Performance ({detail.performance.length})</h4>
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader><TableRow><TableHead className="pl-3">Fund</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Return</TableHead><TableHead className="pr-3 text-right">Benchmark</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {detail.performance.map((p, i) => (
                            <TableRow key={i}>
                              <TableCell className="max-w-56 truncate pl-3">{p.fund_name}{p.share_class && <span className="text-muted-foreground"> · {p.share_class}</span>}</TableCell>
                              <TableCell>{p.period_label}</TableCell>
                              <TableCell className={cn("text-right font-mono tabular-nums", returnClass(p.return_pct))}>{pct(p.return_pct)}</TableCell>
                              <TableCell className="pr-3 text-right font-mono tabular-nums">{pct(p.benchmark_return_pct)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                )}
                {detail.metrics.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-sm font-medium">Metrics ({detail.metrics.length})</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {detail.metrics.map((m, i) => (
                        <div key={i} className="rounded-lg border p-3">
                          <div className="text-muted-foreground text-xs">{humanize(m.name)}{m.fund_name ? ` · ${m.fund_name}` : ""}</div>
                          <div className="font-mono text-sm tabular-nums">{m.value_number !== null ? num(m.value_number) : m.value_text ?? "—"} {m.unit && <span className="text-muted-foreground">{m.unit}</span>}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <details className="text-sm">
                  <summary className="text-muted-foreground cursor-pointer">Raw extraction JSON</summary>
                  <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-3 text-xs">{JSON.stringify(d.extraction, null, 2)}</pre>
                </details>
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reprocess}><RefreshCw /> Re-extract</Button>
              {d.web_view_link && (
                <Button render={<a href={d.web_view_link} target="_blank" rel="noreferrer" />}>
                  <ExternalLink /> Open in Drive
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
