"use client";

import { Folder, RefreshCw } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelative } from "@/lib/format";
import type { SyncStatus } from "@/lib/types";

export function DashboardHeader({
  status,
  busy,
  onChangeFolder,
  onSync,
  children,
}: {
  status: SyncStatus | undefined;
  busy: boolean;
  onChangeFolder: () => void;
  onSync: () => void;
  /** Right-aligned slot, e.g. the account menu. */
  children: React.ReactNode;
}) {
  const connection = status?.connection;
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Logo />
        {connection?.folder_id && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 max-w-56 text-muted-foreground"
                  onClick={onChangeFolder}
                />
              }
            >
              <Folder />
              <span className="hidden truncate sm:inline">
                {connection.folder_name ?? "Folder"}
              </span>
            </TooltipTrigger>
            <TooltipContent>Change watched folder</TooltipContent>
          </Tooltip>
        )}
        <div className="ml-auto flex items-center gap-2">
          {connection?.folder_id && (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
                {busy ? "Syncing…" : `Synced ${formatRelative(connection.last_synced_at)}`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onSync}
                disabled={status?.syncing}
                aria-label="Sync now"
              >
                <RefreshCw className={busy ? "animate-spin" : undefined} />
                <span className="hidden sm:inline">Sync now</span>
              </Button>
            </>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}
