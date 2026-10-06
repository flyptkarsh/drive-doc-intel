"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Folder, Home, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/format";

type DriveFolder = { id: string; name: string };

export function FolderPicker({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: () => void;
}) {
  const [trail, setTrail] = useState<DriveFolder[]>([{ id: "root", name: "My Drive" }]);
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = trail[trail.length - 1];

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams(query.trim() ? { q: query.trim() } : { parent: current.id });
        const res = await api<{ folders: DriveFolder[] }>(`/api/drive/folders?${params}`, { signal: ctrl.signal });
        setFolders(res.folders);
      } catch (err) {
        if ((err as Error).name !== "AbortError") toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    }, query ? 300 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, current.id, query]);

  const choose = async (folder: DriveFolder) => {
    setSaving(true);
    try {
      await api("/api/drive/folder", { method: "POST", body: JSON.stringify(folder) });
      toast.success(`Watching “${folder.name}”`);
      onOpenChange(false);
      onPicked();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a folder to watch</DialogTitle>
          <DialogDescription>Every PDF, HTML, email and CSV in it (and its subfolders) will be ingested.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input placeholder="Search folders by name" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        {!query && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
            {trail.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5" />}
                <button className="hover:text-foreground flex items-center gap-1" onClick={() => setTrail(trail.slice(0, i + 1))}>
                  {i === 0 && <Home className="size-3.5" />}
                  {f.name}
                </button>
              </span>
            ))}
          </div>
        )}
        <ScrollArea className="h-72 rounded-lg border">
          {loading ? (
            <div className="text-muted-foreground flex h-72 items-center justify-center"><Loader2 className="animate-spin" /></div>
          ) : folders.length === 0 ? (
            <div className="text-muted-foreground flex h-72 items-center justify-center text-sm">No folders here</div>
          ) : (
            <ul className="divide-y">
              {folders.map((f) => (
                <li key={f.id} className="hover:bg-muted/60 group flex items-center gap-2 px-3 py-2">
                  <Folder className="text-muted-foreground size-4 shrink-0" />
                  <button
                    className="flex-1 truncate text-left text-sm"
                    onClick={() => {
                      setQuery("");
                      setTrail([...(query ? [trail[0]] : trail), f]);
                    }}
                  >
                    {f.name}
                  </button>
                  <Button size="xs" variant="outline" disabled={saving} onClick={() => choose(f)}>
                    Watch
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button disabled={saving || current.id === "root" || !!query} onClick={() => choose(current)}>
            {saving && <Loader2 className="animate-spin" />}
            Watch “{current.name}”
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
