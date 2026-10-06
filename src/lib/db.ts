import postgres from "postgres";
import { env } from "./env";

declare global {
  var __sql: postgres.Sql | undefined;
  var __migrated: Promise<void> | undefined;
}

function connect() {
  const url = env.databaseUrl;
  const local = /localhost|127\.0\.0\.1/.test(url);
  return postgres(url, {
    max: 10,
    ssl: local ? false : "prefer",
    // numeric columns come back as JS numbers rather than strings
    types: {
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
    },
    onnotice: () => {},
    transform: { undefined: null },
  });
}

export function sql(): postgres.Sql {
  globalThis.__sql ??= connect();
  return globalThis.__sql;
}

const SCHEMA = /* sql */ `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique not null,
  email text not null,
  name text,
  picture text,
  created_at timestamptz not null default now()
);

create table if not exists drive_connections (
  user_id uuid primary key references users(id) on delete cascade,
  refresh_token_enc text not null,
  google_email text,
  folder_id text,
  folder_name text,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  drive_file_id text not null,
  name text not null,
  mime_type text not null,
  web_view_link text,
  drive_modified_at timestamptz,
  md5 text,
  size_bytes bigint,
  status text not null default 'pending',
  error text,
  document_type text,
  title text,
  manager text,
  as_of_date date,
  currency text,
  summary text,
  extraction jsonb,
  text_content text,
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(title, '') || ' ' || coalesce(manager, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce(text_content, ''), 500000)), 'C')
  ) stored,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, drive_file_id)
);
create index if not exists documents_search_idx on documents using gin (search);
create index if not exists documents_user_idx on documents (user_id, status);

create table if not exists funds (
  id bigserial primary key,
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  fund_name text not null,
  share_class text,
  isin text,
  ticker text,
  strategy text,
  asset_class text
);
create index if not exists funds_user_idx on funds (user_id, fund_name);

create table if not exists performance (
  id bigserial primary key,
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  fund_name text not null,
  share_class text,
  period_type text not null,
  period_label text not null,
  period_start date,
  period_end date,
  return_pct numeric not null,
  benchmark_name text,
  benchmark_return_pct numeric,
  is_annualized boolean,
  net_or_gross text,
  currency text
);
create index if not exists performance_user_idx on performance (user_id, fund_name, period_end);

create table if not exists metrics (
  id bigserial primary key,
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  fund_name text,
  name text not null,
  value_number numeric,
  value_text text,
  unit text,
  as_of_date date
);
create index if not exists metrics_user_idx on metrics (user_id, name);
`;

/** Applies the (idempotent) schema once per process. */
export function migrate(): Promise<void> {
  globalThis.__migrated ??= sql()
    .unsafe(SCHEMA)
    .then(() => undefined)
    .catch((err) => {
      globalThis.__migrated = undefined;
      throw err;
    });
  return globalThis.__migrated;
}

export async function db(): Promise<postgres.Sql> {
  await migrate();
  return sql();
}
