export const PERIOD_TYPES = [
  "month",
  "quarter",
  "ytd",
  "1y",
  "3y",
  "5y",
  "10y",
  "since_inception",
  "calendar_year",
  "other",
] as const;

const LABELS: Record<string, string> = {
  month: "Month",
  quarter: "Quarter",
  ytd: "YTD",
  "1y": "1 year",
  "3y": "3 years",
  "5y": "5 years",
  "10y": "10 years",
  since_inception: "Since inception",
  calendar_year: "Calendar year",
  other: "Other",
};

export const periodTypeLabel = (type: string) => LABELS[type] ?? type;
