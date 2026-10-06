export type Status = {
  connected: boolean;
  connection: {
    google_email: string | null;
    folder_id: string | null;
    folder_name: string | null;
    last_synced_at: string | null;
    last_sync_error: string | null;
  } | null;
  syncing: boolean;
  counts: Record<string, number>;
};

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

export type DocumentRow = {
  id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
  status: "pending" | "processing" | "done" | "error";
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
