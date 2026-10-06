import { Card } from "@/components/ui/card";

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <Card className="p-12 text-center text-sm text-muted-foreground">{children}</Card>;
}
