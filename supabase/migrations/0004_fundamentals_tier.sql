-- ───────────────────────────────────────────────────────────────────────────
-- Migration 0004 — fundamentals + news data tier, and reasoning scoring.
--
-- • experiments.data_tier  — 'price' (default; current runs) | 'fundamentals'.
-- • price_snapshots.fundamentals / news — per-ticker jsonb on the shared
--   snapshot (only populated on fundamentals-tier runs).
-- • decisions.reasoning_score / grade_note / graded_day — the thesis-quality
--   grade from the LLM judge.
--
-- All additive + defaulted, so existing price-only runs are unaffected.
-- ───────────────────────────────────────────────────────────────────────────

alter table experiments
  add column if not exists data_tier text not null default 'price';

alter table price_snapshots
  add column if not exists fundamentals jsonb,
  add column if not exists news         jsonb;

alter table decisions
  add column if not exists reasoning_score numeric,
  add column if not exists grade_note      text,
  add column if not exists graded_day      date;
