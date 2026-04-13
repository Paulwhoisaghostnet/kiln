-- Row growth by network
select network, count(*) as tx_count
from tezos_transactions
group by network
order by network;

-- Duplicate safety checks (should return zero rows)
select network, hash, id, count(*) as dupes
from tezos_transactions
group by network, hash, id
having count(*) > 1;

select network, id, count(*) as dupes
from tezos_token_transfers
group by network, id
having count(*) > 1;

-- Checkpoint status
select stream_name, network, cursor, last_id, last_level, last_ts, updated_at
from sync_state
order by updated_at desc;

-- Freshness lag (latest chain event vs latest ingested)
select
  network,
  max(ts) as latest_chain_ts,
  max(ingested_at) as latest_ingested_at,
  max(ingested_at) - max(ts) as ingest_lag
from tezos_transactions
group by network;

-- Spot-check recent ingested records
select network, hash, id, level, ts, sender, target, amount
from tezos_transactions
order by ingested_at desc
limit 20;
