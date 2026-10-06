import { FileStack } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <FileStack className="size-4" />
      </span>
      Folio
    </div>
  );
}
