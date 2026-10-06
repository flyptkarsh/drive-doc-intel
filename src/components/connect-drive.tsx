"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HardDrive, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadGis } from "@/lib/gis";
import { api } from "@/lib/format";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/** Opens Google's consent popup for read-only Drive access and stores the grant server-side. */
export function useConnectDrive(clientId: string, email: string, onConnected: () => void) {
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try {
      await loadGis();
      const client = window.google!.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: `openid email ${DRIVE_SCOPE}`,
        ux_mode: "popup",
        login_hint: email,
        prompt: "consent",
        callback: async (resp) => {
          try {
            if (resp.error || !resp.code) throw new Error(resp.error_description ?? resp.error ?? "Access was not granted");
            await api("/api/drive/connect", { method: "POST", body: JSON.stringify({ code: resp.code }) });
            toast.success("Google Drive connected");
            onConnected();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        },
        error_callback: (err) => {
          setBusy(false);
          if (err.type !== "popup_closed") toast.error(err.message ?? "Couldn't open Google's consent window");
        },
      });
      client.requestCode();
    } catch (err) {
      setBusy(false);
      toast.error((err as Error).message);
    }
  };
  return { connect, busy };
}

export function ConnectDriveCard({ clientId, email, onConnected }: { clientId: string; email: string; onConnected: () => void }) {
  const { connect, busy } = useConnectDrive(clientId, email, onConnected);
  return (
    <Card className="mx-auto mt-12 max-w-lg text-center">
      <CardHeader className="items-center">
        <div className="bg-muted mx-auto mb-2 grid size-12 place-items-center rounded-full">
          <HardDrive className="size-6" />
        </div>
        <CardTitle className="text-xl">Connect Google Drive</CardTitle>
        <CardDescription>
          Folio reads the documents in one folder you choose, extracts the data, and keeps watching it for new files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button size="lg" onClick={connect} disabled={busy} className="w-full">
          {busy ? <Loader2 className="animate-spin" /> : <HardDrive />}
          Connect Google Drive
        </Button>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" /> Read-only access. Folio never edits or deletes your files.
        </p>
      </CardContent>
    </Card>
  );
}
