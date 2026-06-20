-- ───────────────────────────────────────────────────────────────────────────
-- Migration 0002 — scenario ("stress test") experiments.
--
-- A scenario is a sandbox FORK of a live experiment: each model's current
-- portfolio is cloned into a new experiment, then a synthetic price shock is
-- applied there. These columns mark the lineage and keep scenarios out of the
-- default "latest live experiment" view (the home page and cron filter on kind).
--
-- Run against an existing deployment in the Supabase SQL editor.
-- ───────────────────────────────────────────────────────────────────────────

alter table experiments
  add column if not exists kind                 text not null default 'live',
  add column if not exists parent_experiment_id uuid references experiments(id) on delete cascade,
  add column if not exists scenario             jsonb;

-- Existing rows default to 'live'. App code constrains kind to ('live','scenario').
create index if not exists experiments_kind_idx on experiments (kind, created_at desc);
