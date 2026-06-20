-- ───────────────────────────────────────────────────────────────────────────
-- Meridian Bench — database schema (PostgreSQL / Supabase)
--
-- Run in the Supabase SQL editor or via `supabase db push`.
--
-- Money and share quantities are `numeric` (never float). Idempotency for the
-- daily simulation step is enforced by UNIQUE constraints rather than separate
-- coordination tables:
--   • one price snapshot per (experiment, trading_day, ticker)
--   • one decision per (participant, trading_day)   ← the execute-once guard
--   • one NAV point per (participant, trading_day)
-- So a re-fired / duplicated / late cron converges to the same ledger.
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- One arena run.
create table if not exists experiments (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  status               text not null default 'running'
                         check (status in ('draft', 'running', 'completed', 'aborted')),
  start_date           date,
  end_date             date,
  cadence              text not null default 'daily',
  starting_cash        numeric not null default 1000,
  universe             text[] not null,
  benchmark_tickers    text[] not null default '{}',
  rules                jsonb not null,
  model_params         jsonb not null,
  prompt_template      text not null,
  prompt_template_hash text not null,
  -- 'live' = a real run; 'scenario' = a synthetic-shock sandbox forked from a parent.
  kind                 text not null default 'live'
                         check (kind in ('live', 'scenario')),
  parent_experiment_id uuid references experiments(id) on delete cascade,
  scenario             jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists experiments_kind_idx on experiments (kind, created_at desc);

-- One competitor (an LLM trader or a passive buy-and-hold control).
create table if not exists participants (
  id                uuid primary key default gen_random_uuid(),
  experiment_id     uuid not null references experiments(id) on delete cascade,
  model_id          text not null,
  label             text not null,
  kind              text not null default 'llm' check (kind in ('llm', 'passive')),
  benchmark_ticker  text,
  starting_cash     numeric not null,
  cash              numeric not null,
  status            text not null default 'active',
  created_at        timestamptz not null default now(),
  unique (experiment_id, label)
);
create index if not exists participants_experiment_idx on participants (experiment_id);

-- The shared daily market state. Written once before any model runs.
create table if not exists price_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  experiment_id      uuid not null references experiments(id) on delete cascade,
  trading_day        date not null,
  ticker             text not null,
  open               numeric,
  close              numeric,
  prev_close         numeric,
  pct_change_1d      numeric,
  pct_change_5d      numeric,
  sma20              numeric,
  sma50              numeric,
  pct_from_20d_high  numeric,
  source             text not null default 'FMP',
  fetched_at         timestamptz not null default now(),
  unique (experiment_id, trading_day, ticker)
);
create index if not exists price_snapshots_day_idx on price_snapshots (experiment_id, trading_day);

-- Current holdings per participant (closed positions kept with shares = 0).
create table if not exists positions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  ticker         text not null,
  shares         numeric not null default 0,
  avg_cost       numeric not null default 0,
  realized_pnl   numeric not null default 0,
  updated_at     timestamptz not null default now(),
  unique (participant_id, ticker)
);
create index if not exists positions_participant_idx on positions (participant_id);

-- The journal: one row per participant per trading day (raw model output + telemetry).
create table if not exists decisions (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references participants(id) on delete cascade,
  experiment_id   uuid not null references experiments(id) on delete cascade,
  trading_day     date not null,
  thesis          text,
  confidence      numeric,
  market_outlook  text,
  orders_raw      jsonb not null default '[]',
  input_tokens    integer,
  output_tokens   integer,
  latency_ms      integer,
  model_id        text,
  error           text,
  created_at      timestamptz not null default now(),
  unique (participant_id, trading_day)
);
create index if not exists decisions_day_idx on decisions (experiment_id, trading_day);

-- Immutable executed fills.
create table if not exists trades (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references participants(id) on delete cascade,
  experiment_id   uuid not null references experiments(id) on delete cascade,
  decision_id     uuid references decisions(id) on delete cascade,
  trading_day     date not null,
  ticker          text not null,
  side            text not null,
  shares          numeric not null,
  fill_price      numeric not null,
  notional        numeric not null,
  realized_pnl    numeric,
  created_at      timestamptz not null default now()
);
create index if not exists trades_participant_day_idx on trades (participant_id, trading_day);

-- Referee results — one row per order (accepted / clipped / rejected + reason).
create table if not exists order_validations (
  id                 uuid primary key default gen_random_uuid(),
  decision_id        uuid not null references decisions(id) on delete cascade,
  participant_id     uuid not null references participants(id) on delete cascade,
  trading_day        date not null,
  ticker             text not null,
  side               text not null,
  requested_notional numeric,
  final_notional     numeric,
  final_shares       numeric,
  fill_price         numeric,
  status             text not null,
  reason_code        text,
  note               text,
  created_at         timestamptz not null default now()
);
create index if not exists order_validations_decision_idx on order_validations (decision_id);

-- Daily equity-curve points. Feeds the leaderboard and charts.
create table if not exists nav_history (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references participants(id) on delete cascade,
  experiment_id   uuid not null references experiments(id) on delete cascade,
  trading_day     date not null,
  nav             numeric not null,
  cash            numeric not null,
  invested_value  numeric not null,
  daily_return    numeric,
  created_at      timestamptz not null default now(),
  unique (participant_id, trading_day)
);
create index if not exists nav_history_day_idx on nav_history (experiment_id, trading_day);

-- ───────────────────────────────────────────────────────────────────────────
-- Row-Level Security: the public read UI uses the anon key and may only READ.
-- All writes go through the service-role key in server code (bypasses RLS).
-- ───────────────────────────────────────────────────────────────────────────
alter table experiments       enable row level security;
alter table participants      enable row level security;
alter table price_snapshots   enable row level security;
alter table positions         enable row level security;
alter table decisions         enable row level security;
alter table trades            enable row level security;
alter table order_validations enable row level security;
alter table nav_history       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'experiments','participants','price_snapshots','positions',
    'decisions','trades','order_validations','nav_history'
  ]
  loop
    execute format(
      'create policy %I_anon_read on %I for select using (true);', t, t
    );
  end loop;
end $$;
