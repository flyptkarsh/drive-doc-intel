"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, MessageSquareText, Table2 } from "lucide-react";
import { AskView } from "@/components/ask/ask-view";
import { DocumentsView } from "@/components/documents/documents-view";
import { PerformanceView } from "@/components/performance/performance-view";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnectDrive } from "@/hooks/use-connect-drive";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { apiFetch, apiPost } from "@/lib/fetcher";
import type { User } from "@/lib/types";
import { AccountMenu } from "./account-menu";
import { ConnectDriveCard } from "./connect-drive-card";
import { DashboardHeader } from "./dashboard-header";
import { FolderPicker } from "./folder-picker";
import { StatCards } from "./stat-cards";
import { SyncErrorBanner } from "./sync-error-banner";

export function Dashboard({ user, clientId }: { user: User; clientId: string }) {
  const router = useRouter();
  const { status, busy, refresh } = useSyncStatus();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { connect: reconnect } = useConnectDrive(clientId, user.email, () => void refresh());

  // Open the picker automatically once Drive is connected but no folder is chosen yet.
  const [folderPromptDismissed, setFolderPromptDismissed] = useState(false);
  const needsFolder = !!status?.connected && !status.connection?.folder_id;
  const folderPickerOpen = pickerOpen || (needsFolder && !folderPromptDismissed);
  const setFolderPickerOpen = (open: boolean) => {
    setPickerOpen(open);
    if (!open) setFolderPromptDismissed(true);
  };

  const syncNow = async () => {
    try {
      await apiPost("/api/sync");
      toast("Checking your folder for changes…");
      void refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const signOut = async () => {
    window.google?.accounts.id.disableAutoSelect();
    await apiPost("/api/auth/logout");
    router.replace("/");
    router.refresh();
  };

  const disconnect = async () => {
    const confirmed = window.confirm(
      "Disconnect Google Drive? This removes all ingested documents and extracted data from " +
        "Folio. Your Drive files are untouched.",
    );
    if (!confirmed) return;
    try {
      await apiFetch("/api/drive/connect", { method: "DELETE" });
      void refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const total = Object.values(status?.counts ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <div className="min-h-screen">
      <DashboardHeader
        status={status}
        busy={busy}
        onChangeFolder={() => setPickerOpen(true)}
        onSync={syncNow}
      >
        <AccountMenu
          user={user}
          driveConnected={!!status?.connected}
          onChangeFolder={() => setPickerOpen(true)}
          onDisconnect={disconnect}
          onSignOut={signOut}
        />
      </DashboardHeader>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {status && !status.connected && (
          <ConnectDriveCard
            clientId={clientId}
            email={user.email}
            onConnected={() => void refresh()}
          />
        )}
        {status?.connected && (
          <div className="space-y-6">
            {status.connection?.last_sync_error && (
              <SyncErrorBanner
                error={status.connection.last_sync_error}
                needsReconnect={status.connection.needs_reconnect}
                onReconnect={reconnect}
              />
            )}
            <StatCards counts={status.counts} />
            <Tabs defaultValue="performance">
              <TabsList className="w-full sm:w-fit max-sm:[&_svg]:hidden">
                <TabsTrigger value="performance">
                  <Table2 /> Performance
                </TabsTrigger>
                <TabsTrigger value="documents">
                  <FileText /> Documents
                  {total > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {total}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="ask">
                  <MessageSquareText /> Ask
                </TabsTrigger>
              </TabsList>
              <TabsContent value="performance" className="mt-4">
                <PerformanceView />
              </TabsContent>
              <TabsContent value="documents" className="mt-4">
                <DocumentsView />
              </TabsContent>
              <TabsContent value="ask" className="mt-4">
                <AskView />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      <FolderPicker
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        onPicked={() => void refresh()}
      />
    </div>
  );
}
