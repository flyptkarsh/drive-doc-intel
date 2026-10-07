import "server-only";

/**
 * The full database schema. Every statement is idempotent, so it is applied on
 * startup instead of through a migration tool.
 */
export const SCHEMA = /* sql */ `
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
    setweight(to_tsvector('english', left(coalesce(text_content, ''), 200000)), 'C')
  ) stored,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, drive_file_id)
);
create index if not exists documents_search_idx on documents using gin (search);
-- Processing claims: a worker owns a document while claim_id matches its token.
alter table documents add column if not exists claim_id uuid;
alter table documents add column if not exists claimed_at timestamptz;
create index if not exists documents_user_idx on documents (user_id, status);

-- Earlier versions indexed 500k characters, which can exceed the 1 MB tsvector limit.
do $$ begin
  if exists (
    select 1 from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'documents'::regclass and a.attname = 'search'
      and pg_get_expr(d.adbin, d.adrelid) like '%500000%'
  ) then
    alter table documents alter column search set expression as (
      setweight(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(title, '') || ' ' || coalesce(manager, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
      setweight(to_tsvector('english', left(coalesce(text_content, ''), 200000)), 'C')
    );
  end if;
end $$;

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
