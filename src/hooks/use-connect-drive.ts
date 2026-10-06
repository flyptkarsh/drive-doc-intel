"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DRIVE_SCOPE } from "@/lib/constants";
import { apiPost } from "@/lib/fetcher";
import { loadGis } from "@/lib/gis";

/** Opens Google's consent popup for read-only Drive access and stores the grant server-side. */
export function useConnectDrive(clientId: string, email: string, onConnected: () => void) {
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      await loadGis();
      const codeClient = window.google!.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: `openid email ${DRIVE_SCOPE}`,
        ux_mode: "popup",
        login_hint: email,
        // Always show consent so Google issues a refresh token.
        prompt: "consent",
        callback: async ({ code, error, error_description }) => {
          try {
            if (error || !code)
              throw new Error(error_description ?? error ?? "Access was not granted");
            await apiPost("/api/drive/connect", { code });
            toast.success("Google Drive connected");
            onConnected();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        },
        error_callback: ({ type, message }) => {
          setBusy(false);
          if (type !== "popup_closed")
            toast.error(message ?? "Couldn't open Google's consent window");
        },
      });
      codeClient.requestCode();
    } catch (err) {
      setBusy(false);
      toast.error((err as Error).message);
    }
  };

  return { connect, busy };
}
