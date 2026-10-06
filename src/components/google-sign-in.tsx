"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { loadGis } from "@/lib/gis";

/** Google One Tap plus a rendered "Sign in with Google" button as the fallback. */
export function GoogleSignIn({ clientId }: { clientId: string }) {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !window.google) return;
        const id = window.google.accounts.id;
        id.initialize({
          client_id: clientId,
          auto_select: true,
          cancel_on_tap_outside: false,
          use_fedcm_for_prompt: true,
          itp_support: true,
          context: "signin",
          callback: async ({ credential }) => {
            setBusy(true);
            const res = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            if (res.ok) {
              router.replace("/dashboard");
              router.refresh();
            } else {
              setBusy(false);
              const { error } = await res.json().catch(() => ({ error: "Sign-in failed" }));
              toast.error(error ?? "Sign-in failed");
            }
          },
        });
        if (buttonRef.current) {
          id.renderButton(buttonRef.current, {
            theme: "filled_black",
            size: "large",
            shape: "pill",
            text: "continue_with",
            width: 280,
          });
        }
        id.prompt();
      })
      .catch((err) => toast.error(err.message));
    return () => {
      cancelled = true;
      window.google?.accounts.id.cancel();
    };
  }, [clientId, router]);

  return (
    <div className="flex min-h-11 flex-col items-center gap-2">
      <div ref={buttonRef} className={busy ? "pointer-events-none opacity-50" : undefined} />
      {busy && <p className="text-muted-foreground text-xs">Signing you in…</p>}
    </div>
  );
}
