// Shapes shared by the API and the UI. Dates are "YYYY-MM-DD" strings and
// timestamps are ISO 8601 strings once serialized to JSON.

export type User = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export type DocumentStatus = "pending" | "processing" | "done" | "error";

export type SyncStatus = {
  connected: boolean;
  connection: {
    google_email: string | null;
    folder_id: string | null;
    folder_name: string | null;
    last_synced_at: string | null;
    last_sync_error: string | null;
    /** The last error means Drive access is gone and the user must reconnect. */
    needs_reconnect: boolean;
  } | null;
  syncing: boolean;
  counts: Partial<Record<DocumentStatus, number>>;
};

export type DriveFolder = { id: string; name: string };

export type PerformanceRow = {
  id: number;
  document_id: string;
  document_name: string;
  manager: string | null;
  web_view_link: string | null;
  fund_name: string;
  share_class: string | null;
  period_type: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  return_pct: number;
  benchmark_name: string | null;
  benchmark_return_pct: number | null;
  is_annualized: boolean | null;
  net_or_gross: string | null;
  currency: string | null;
};

export type PerformanceResponse = {
  rows: PerformanceRow[];
  funds: string[];
  /** More rows matched than were returned; narrow the filters. */
  truncated: boolean;
};

export type DocumentRow = {
  id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
  status: DocumentStatus;
  error: string | null;
  document_type: string | null;
  title: string | null;
  manager: string | null;
  as_of_date: string | null;
  currency: string | null;
  summary: string | null;
  drive_modified_at: string | null;
  processed_at: string | null;
  performance_count: number;
  metric_count: number;
  funds: string[] | null;
};

export type DocumentPerformance = Pick<
  PerformanceRow,
  | "fund_name"
  | "share_class"
  | "period_type"
  | "period_label"
  | "period_start"
  | "period_end"
  | "return_pct"
  | "benchmark_name"
  | "benchmark_return_pct"
  | "is_annualized"
  | "net_or_gross"
>;

export type DocumentMetric = {
  fund_name: string | null;
  name: string;
  value_number: number | null;
  value_text: string | null;
  unit: string | null;
  as_of_date: string | null;
};

export type DocumentDetail = {
  document: Omit<DocumentRow, "performance_count" | "metric_count" | "funds"> & {
    extraction: unknown;
  };
  performance: DocumentPerformance[];
  metrics: DocumentMetric[];
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AskResult = {
  answer: string;
  queries: { sql: string; rowCount?: number; error?: string }[];
  sources: { id: string; name: string; link: string | null }[];
};
