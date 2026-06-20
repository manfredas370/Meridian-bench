# Changelog

## v1.0.0 — 2026-06-20

First stable release. The arena is **deployed, live, and running autonomously**
on Vercel — six models plus SPY/QQQ controls trading daily on real Twelve Data
prices, driven by the daily cron. Everything in the alpha is now hardened and the
read UI has been rebuilt around a Google-Finance-style light theme.

### Reliability
- **Cron reliability fix** — the daily step now runs every participant
  concurrently in a single invocation (`Promise.all` + per-call timeout) instead
  of self-fetch fan-out, which had silently dropped day-1 workers on Vercel.
- Per-model decision call hardened with a 120s abort and hold-on-failure.

### Models
- Roster finalized: **Claude Opus 4.8, Claude Sonnet 4.6, GPT-5.5, Gemini 3.1
  Pro Preview, DeepSeek V3.2 Thinking, Kimi K2 Thinking** + **SPY/QQQ** controls.
- **Swapped GLM 5.2 → Kimi K2 Thinking** — GLM required provider credit/BYOK on
  the AI Gateway and fell back/errored; Kimi bills through the gateway and is an
  intrinsic-reasoning model.

### UI — Google Finance light redesign
- New brand logo + GF-light token system (Geist fonts retained).
- Standings: leaderboard with vertical color-bar markers + a clean **line chart**
  of every model's NAV (straight segments, no smoothing, no gradients, no legend
  — the table and hover tooltip carry identity).
- Per-model page rebuilt: hero NAV/return, stat row, and a **tabbed chart card** —
  *Performance* (NAV line) and *Holdings* (portfolio allocation as a stacked bar
  chart over time, reconstructed from the trade ledger). Holdings, decision
  journal (timeline), and trade blotter below.
- Each model's chart line now uses **its standings color** (e.g. DeepSeek orange).

### Deployment
- Live on Vercel with Supabase (Postgres) as the production store and a daily
  Vercel cron advancing the simulation server-side.

## v0.1.0-alpha — 2026-06-19

First working alpha of **Meridian Bench** — a multi-LLM paper-trading arena where
several models each manage a virtual $1000 portfolio under identical rules and
market data, and only the model differs.

### Core engine
- Deterministic **referee** (position cap, cash reserve, long-only, min order,
  daily order cap) and **ledger** (fractional fills, average cost, realized/
  unrealized P&L, NAV reconciles to the penny). 26 unit + integration tests.
- **Daily-tick engine**: snapshot → decide → referee → ledger → mark NAV.
  Idempotent — a duplicated/late/re-fired cron is a no-op (the `decisions` row is
  the execute-once guard).
- Cron **orchestrator** + per-participant fan-out **worker**; one shared price
  snapshot per day is the fairness keystone.

### Market data
- **Twelve Data** is the sole provider (broad free US coverage). Batched,
  rate-limit-aware client for the free 8-calls/min tier.
- Full ~18-ticker cross-theme universe + SPY/QQQ benchmarks.
- _Dropped FMP_ — its free plan covered only a handful of symbols and the legacy
  v3 API is retired for new keys.

### Models (Vercel AI Gateway)
- Roster: **Claude Opus 4.8, Claude Sonnet 4.6, GPT-5.5, Gemini 3.1 Pro Preview,
  DeepSeek V3.2 Thinking, GLM 5.2** + **SPY/QQQ** passive controls.
- Per-model high-effort reasoning via `MODEL_CALL_CONFIG`: Anthropic adaptive
  (Opus) / enabled (Sonnet) thinking, OpenAI `reasoningEffort: high`, Google
  `thinkingConfig`.
- Decision generation uses **`generateText` + JSON parse/validate** (one repair
  retry), not `generateObject` — forcing a tool call is incompatible with
  extended thinking and brittle for open models.
- All six verified returning valid decisions on live Twelve Data prices.

### Storage & hosting
- **Supabase** (Postgres) store with RLS read policies; file/in-memory stores for
  zero-config local dev.
- **Next.js 16** on Vercel; daily cron drives the simulation server-side.

### UI
- Leaderboard (total return, beat-SPY, max drawdown, cash), overlaid equity
  curves, and per-model drill-down (holdings, decision journal, trades).

### Known limits (deliberate for the alpha)
- Price/technical inputs only (no fundamentals/news yet).
- Live-forward only (no historical replay — it would be training-data
  contaminated). Sharpe/win-rate deferred; market holidays not modeled.
