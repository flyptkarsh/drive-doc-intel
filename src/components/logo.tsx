import { FileStack } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg">
        <FileStack className="size-4" />
      </span>
      Folio
    </div>
  );
}
