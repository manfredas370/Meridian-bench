-- ───────────────────────────────────────────────────────────────────────────
-- Migration 0003 — per-participant "analyst take".
--
-- A short, AI-generated executive summary of each model's strategy + standing,
-- refreshed daily by the cron and shown on the model's drill-down page.
-- ───────────────────────────────────────────────────────────────────────────

alter table participants
  add column if not exists summary     text,
  add column if not exists summary_day date;
