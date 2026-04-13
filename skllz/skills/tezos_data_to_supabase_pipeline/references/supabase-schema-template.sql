-- Supabase template: Tezos ingestion tables

create table if not exists sync_state (
  stream_name text not null,
  network text not null,
  cursor text,
  last_id bigint,
  last_level bigint,
  last_ts timestamptz,
  updated_at timestamptz not null default now(),
  primary key (stream_name, network)
);

create table if not exists tezos_accounts (
  network text not null,
  address text not null,
  type text,
  balance numeric,
  delegate text,
  source_ts timestamptz,
  ingested_at timestamptz not null default now(),
  primary key (network, address)
);

create table if not exists tezos_transactions (
  network text not null,
  hash text not null,
  id bigint not null,
  level bigint,
  ts timestamptz,
  sender text,
  target text,
  amount numeric,
  status text,
  source_ts timestamptz,
  ingested_at timestamptz not null default now(),
  primary key (network, hash, id)
);

create table if not exists tezos_token_transfers (
  network text not null,
  id bigint not null,
  token_contract text,
  token_id text,
  from_address text,
  to_address text,
  amount numeric,
  level bigint,
  ts timestamptz,
  source_ts timestamptz,
  ingested_at timestamptz not null default now(),
  primary key (network, id)
);

create table if not exists tezos_events_raw (
  network text not null,
  stream_name text not null,
  source_id text not null,
  payload jsonb not null,
  source_ts timestamptz,
  ingested_at timestamptz not null default now(),
  primary key (network, stream_name, source_id)
);

create index if not exists idx_tezos_transactions_network_level on tezos_transactions (network, level desc);
create index if not exists idx_tezos_transactions_network_ingested on tezos_transactions (network, ingested_at desc);
create index if not exists idx_tezos_transfers_network_level on tezos_token_transfers (network, level desc);
create index if not exists idx_tezos_events_raw_network_ts on tezos_events_raw (network, source_ts desc);
