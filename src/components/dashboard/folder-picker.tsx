"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ChevronRight, Folder, Home, Loader2 } from "lucide-react";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiPost, swrFetcher } from "@/lib/fetcher";
import type { DriveFolder } from "@/lib/types";

const ROOT: DriveFolder = { id: "root", name: "My Drive" };

export function FolderPicker({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: () => void;
}) {
  const [trail, setTrail] = useState<DriveFolder[]>([ROOT]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const search = useDebouncedValue(query.trim());
  const current = trail[trail.length - 1];

  const params = new URLSearchParams(search ? { q: search } : { parent: current.id });
  const { data, error, isLoading } = useSWR<{ folders: DriveFolder[] }>(
    open ? `/api/drive/folders?${params}` : null,
    swrFetcher,
  );
  const folders = data?.folders ?? [];

  const openFolder = (folder: DriveFolder) => {
    setTrail(search ? [ROOT, folder] : [...trail, folder]);
    setQuery("");
  };

  const watch = async (folder: DriveFolder) => {
    setSaving(true);
    try {
      await apiPost("/api/drive/folder", folder);
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
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a folder to watch</DialogTitle>
          <DialogDescription>
            Every PDF, HTML, email and CSV in it (and its subfolders) will be ingested.
          </DialogDescription>
        </DialogHeader>

        <SearchInput
          placeholder="Search folders by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search folders"
        />

        {!search && (
          <nav
            aria-label="Folder path"
            className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
          >
            {trail.map((folder, i) => (
              <span key={folder.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5" />}
                <button
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => setTrail(trail.slice(0, i + 1))}
                >
                  {i === 0 && <Home className="size-3.5" />}
                  {folder.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        <ScrollArea className="h-72 rounded-lg border">
          {isLoading ? (
            <Centered>
              <Loader2 className="animate-spin" />
            </Centered>
          ) : error ? (
            <Centered>{(error as Error).message}</Centered>
          ) : folders.length === 0 ? (
            <Centered>No folders here</Centered>
          ) : (
            <ul className="divide-y">
              {folders.map((folder) => (
                <li key={folder.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60">
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <button
                    className="flex-1 truncate text-left text-sm"
                    onClick={() => openFolder(folder)}
                  >
                    {folder.name}
                  </button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={saving}
                    onClick={() => watch(folder)}
                  >
                    Watch
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            disabled={saving || current.id === ROOT.id || !!search}
            onClick={() => watch(current)}
          >
            {saving && <Loader2 className="animate-spin" />}
            Watch “{current.name}”
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
