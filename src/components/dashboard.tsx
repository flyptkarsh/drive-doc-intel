"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, FileText, Folder, FolderSync, LogOut, MessageSquareText, RefreshCw, Table2, Unplug } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, relative } from "@/lib/format";
import type { User } from "@/lib/session";
import { AskView } from "./ask-view";
import { ConnectDriveCard, useConnectDrive } from "./connect-drive";
import { DocumentsView } from "./documents-view";
import { FolderPicker } from "./folder-picker";
import { Logo } from "./logo";
import { PerformanceView } from "./performance-view";
import type { Status } from "./types";

export function Dashboard({ user, clientId }: { user: User; clientId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastSignature = useRef("");

  const loadStatus = useCallback(async () => {
    try {
      const s = await api<Status>("/api/status");
      setStatus(s);
      // Refresh the tables whenever document counts or sync time move.
      const sig = JSON.stringify([s.counts, s.connection?.last_synced_at, s.connection?.folder_id]);
      if (sig !== lastSignature.current) {
        lastSignature.current = sig;
        setRefreshKey((k) => k + 1);
      }
      if (s.connected && !s.connection?.folder_id) setPickerOpen(true);
    } catch {
      /* keep the last known status */
    }
  }, []);

  const busy = !!status && (status.syncing || (status.counts.pending ?? 0) + (status.counts.processing ?? 0) > 0);

  useEffect(() => {
    const first = setTimeout(loadStatus, 0);
    const t = setInterval(loadStatus, busy ? 3000 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadStatus, busy]);

  const { connect: reconnect } = useConnectDrive(clientId, user.email, loadStatus);

  const syncNow = async () => {
    await api("/api/sync", { method: "POST" }).catch((e) => toast.error(e.message));
    toast("Checking your folder for changes…");
    setTimeout(loadStatus, 800);
  };

  const signOut = async () => {
    window.google?.accounts.id.disableAutoSelect();
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Google Drive? This removes all ingested documents and extracted data from Folio (your Drive files are untouched).")) return;
    await api("/api/drive/connect", { method: "DELETE" }).catch((e) => toast.error(e.message));
    loadStatus();
  };

  const c = status?.counts ?? {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const inFlight = (c.pending ?? 0) + (c.processing ?? 0);

  return (
    <div className="min-h-screen">
      <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          {status?.connection?.folder_id && (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground ml-2 max-w-56" onClick={() => setPickerOpen(true)} />}>
                <Folder /> <span className="truncate">{status.connection.folder_name ?? "Folder"}</span>
              </TooltipTrigger>
              <TooltipContent>Change watched folder</TooltipContent>
            </Tooltip>
          )}
          <div className="ml-auto flex items-center gap-2">
            {status?.connection?.folder_id && (
              <>
                <span className="text-muted-foreground hidden text-xs sm:inline">
                  {busy ? "Syncing…" : `Synced ${relative(status.connection.last_synced_at)}`}
                </span>
                <Button variant="outline" size="sm" onClick={syncNow} disabled={status.syncing}>
                  <RefreshCw className={busy ? "animate-spin" : undefined} /> Sync now
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={<button className="rounded-full" aria-label="Account" />}>
                <Avatar className="size-8">
                  {user.picture && <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />}
                  <AvatarFallback>{(user.name ?? user.email).slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="text-foreground font-medium">{user.name}</div>
                    <div className="text-muted-foreground truncate text-xs font-normal">{user.email}</div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {status?.connected && (
                  <>
                    <DropdownMenuItem onClick={() => setPickerOpen(true)}><FolderSync /> Change folder</DropdownMenuItem>
                    <DropdownMenuItem onClick={disconnect}><Unplug /> Disconnect Drive</DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={signOut}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {status === null ? null : !status.connected ? (
          <ConnectDriveCard clientId={clientId} email={user.email} onConnected={loadStatus} />
        ) : (
          <div className="space-y-6">
            {status.connection?.last_sync_error && (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="flex items-start gap-3 text-sm">
                  <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">The last sync failed</div>
                    <div className="text-muted-foreground">{status.connection.last_sync_error}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={reconnect}>Reconnect Drive</Button>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Documents" value={total} />
              <Stat label="Extracted" value={c.done ?? 0} />
              <Stat label="In progress" value={inFlight} pulse={inFlight > 0} />
              <Stat label="Failed" value={c.error ?? 0} tone={c.error ? "bad" : undefined} />
            </div>
            <Tabs defaultValue="performance">
              <TabsList>
                <TabsTrigger value="performance"><Table2 /> Performance</TabsTrigger>
                <TabsTrigger value="documents"><FileText /> Documents {total > 0 && <Badge variant="secondary" className="ml-1">{total}</Badge>}</TabsTrigger>
                <TabsTrigger value="ask"><MessageSquareText /> Ask</TabsTrigger>
              </TabsList>
              <TabsContent value="performance" className="mt-4"><PerformanceView refreshKey={refreshKey} /></TabsContent>
              <TabsContent value="documents" className="mt-4"><DocumentsView refreshKey={refreshKey} /></TabsContent>
              <TabsContent value="ask" className="mt-4"><AskView /></TabsContent>
            </Tabs>
          </div>
        )}
      </main>
      <FolderPicker open={pickerOpen} onOpenChange={setPickerOpen} onPicked={loadStatus} />
    </div>
  );
}

function Stat({ label, value, pulse, tone }: { label: string; value: number; pulse?: boolean; tone?: "bad" }) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {pulse && <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />}
          {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
