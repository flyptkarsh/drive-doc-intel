"use client";

import { Grid3x3, Rows3 } from "lucide-react";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_TYPES, periodTypeLabel } from "./period";

export type ViewMode = "table" | "grid";

export type Filters = {
  fund: string;
  periodType: string;
  from: string;
  to: string;
  text: string;
};

export const ALL = "all";
export const DEFAULT_FILTERS: Filters = { fund: ALL, periodType: ALL, from: "", to: "", text: "" };

export function PerformanceFilters({
  filters,
  onChange,
  funds,
  mode,
  onModeChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  funds: string[];
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });
  const fundItems = [
    { value: ALL, label: "All funds" },
    ...funds.map((f) => ({ value: f, label: f })),
  ];
  const periodItems = [
    { value: ALL, label: "All periods" },
    ...PERIOD_TYPES.map((p) => ({ value: p, label: periodTypeLabel(p) })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        className="min-w-48 flex-1"
        placeholder="Filter rows…"
        value={filters.text}
        onChange={(e) => set("text", e.target.value)}
        aria-label="Filter rows"
      />
      <Select items={fundItems} value={filters.fund} onValueChange={(v) => set("fund", v ?? ALL)}>
        <SelectTrigger className="w-56" aria-label="Fund">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fundItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={periodItems}
        value={filters.periodType}
        onValueChange={(v) => set("periodType", v ?? ALL)}
      >
        <SelectTrigger className="w-40" aria-label="Period type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periodItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={filters.from}
        onChange={(e) => set("from", e.target.value)}
        className="w-38"
        aria-label="Period ending from"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        value={filters.to}
        onChange={(e) => set("to", e.target.value)}
        className="w-38"
        aria-label="Period ending to"
      />
      <div className="ml-auto flex rounded-lg border p-0.5" role="group" aria-label="View">
        <Button
          size="sm"
          variant={mode === "table" ? "secondary" : "ghost"}
          onClick={() => onModeChange("table")}
        >
          <Rows3 /> Table
        </Button>
        <Button
          size="sm"
          variant={mode === "grid" ? "secondary" : "ghost"}
          onClick={() => onModeChange("grid")}
        >
          <Grid3x3 /> Monthly grid
        </Button>
      </div>
    </div>
  );
}
