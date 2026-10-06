"use client";

import { HardDrive, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConnectDrive } from "@/hooks/use-connect-drive";

export function ConnectDriveCard({
  clientId,
  email,
  onConnected,
}: {
  clientId: string;
  email: string;
  onConnected: () => void;
}) {
  const { connect, busy } = useConnectDrive(clientId, email, onConnected);
  return (
    <Card className="mx-auto mt-12 max-w-lg text-center">
      <CardHeader>
        <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-muted">
          <HardDrive className="size-6" />
        </div>
        <CardTitle className="text-xl">Connect Google Drive</CardTitle>
        <CardDescription>
          Folio reads the documents in one folder you choose, extracts the data, and keeps watching
          it for new files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button size="lg" onClick={connect} disabled={busy} className="w-full">
          {busy ? <Loader2 className="animate-spin" /> : <HardDrive />}
          Connect Google Drive
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Read-only access. Folio never edits or deletes your files.
        </p>
      </CardContent>
    </Card>
  );
}
