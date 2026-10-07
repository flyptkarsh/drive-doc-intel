import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function SyncErrorBanner({
  error,
  needsReconnect,
  onReconnect,
}: {
  error: string;
  /** Offer "Reconnect Drive" only when the error is about lost Drive access. */
  needsReconnect: boolean;
  onReconnect: () => void;
}) {
  return (
    <Card className="border-destructive/40 bg-destructive/5" role="alert">
      <CardContent className="flex items-start gap-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="flex-1">
          <div className="font-medium">The last sync failed</div>
          <div className="text-muted-foreground">{error}</div>
        </div>
        {needsReconnect && (
          <Button size="sm" variant="outline" onClick={onReconnect}>
            Reconnect Drive
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
