# Meridian Bench

A **multi-LLM paper-trading arena**. Several LLM models each manage a simulated
**$1000** portfolio of US stocks over a ~1-month experiment. Same starting cash,
same tradeable universe, same rules, same market data, identical prompt — **only
the model differs**. All trades are fake but priced at real market prices, so
portfolios and P&L behave as they would in reality. The output is a leaderboard
and equity curves comparing models head-to-head.

It is the benchmarking sibling of the "Meridian Fund" spec: it **reuses** that
project's stack, deterministic risk engine (here the order *referee*), paper
portfolio and watchlist, but **intentionally drops** human approval and the
6-agent council — each model is a single autonomous trader, which is the only
honest way to benchmark *the model*. No real money ever moves.

---

## Quick start (zero-config local demo — no API keys)

```bash
npm install
npm run dev
```

Then advance the simulation (auto-seeds an experiment on first call) and open
the leaderboard:

```bash
curl -X POST "http://localhost:3000/api/dev/tick?day=2026-06-15"   # run once per trading day
curl -X POST "http://localhost:3000/api/dev/tick?day=2026-06-16"   # ...repeat to build the curve
open http://localhost:3000
```

With no keys present the app runs fully mocked: **file store + deterministic
synthetic prices + a deterministic mock trader**. Great for exercising the whole
pipeline.

---

## How it works

```
Vercel Cron (weekday after US close) ─▶ /api/cron/step   (orchestrator)
  1. resolve experiment + trading day
  2. write ONE shared price snapshot (Twelve Data)        ← fairness keystone
  3. fan out one /api/step worker per participant          ← after() + fetch, never awaited

/api/step (one per model)         lib/engine/tick.ts → stepParticipant()
  load shared snapshot + own portfolio + rules + memory
  → generateText + JSON parse/validate via AI Gateway  (lib/decision.ts)
  → referee.validateOrders()   pure, clips/rejects   (lib/referee.ts)
  → ledger.applyExecution()    fractional fills, P&L  (lib/ledger.ts)
  → mark NAV at close, journal everything
```

- **Exactly-once / idempotent.** The `decisions` row (unique per participant +
  day) is the execute-once guard; the shared snapshot and `nav_history` are
  unique per day too. A duplicated, late, or re-fired cron is a no-op.
- **Fairness by construction.** One shared snapshot per day (never per-model
  fetches), one rules object, one prompt template (only `modelId` varies),
  identical model params and memory policy. Failures degrade to a logged "hold"
  for every model alike.
- **No look-ahead.** Indicators are computed through the prior close (T-1);
  orders fill at the next open; NAV is marked at the close.
- **Passive controls.** SPY and QQQ buy-and-hold "bots" run deterministically
  (bypassing the referee) as the bar every model must beat.

---

## Configuration

Everything about a run lives in [`lib/config.ts`](lib/config.ts) and is copied
into the `experiments` row at seed time:

- `DEFAULT_UNIVERSE` — the tradeable tickers (a liquid cross-theme slice of the watchlist).
- `BENCHMARK_TICKERS` — `SPY`, `QQQ` (priced + charted, never traded by models).
- `DEFAULT_RULES` — position cap (20% NAV), cash reserve (5%), max orders/day,
  min order, long-only/no-leverage/no-options.
- `DEFAULT_ROSTER` — the competing models (slugs verified against the live
  catalog). Per-model reasoning/effort lives in `MODEL_CALL_CONFIG` (see Models below).
- `DEFAULT_MODEL_PARAMS` and `SYSTEM_PROMPT` — identical for every participant.

---

## Models

The starting roster (exact AI Gateway slugs; edit in [`lib/config.ts`](lib/config.ts)).
High-effort reasoning is set per model in `MODEL_CALL_CONFIG`:

| Model | Slug | Reasoning |
|---|---|---|
| Claude Opus 4.8 | `anthropic/claude-opus-4.8` | adaptive thinking |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4.6` | extended thinking (budget) |
| GPT-5.5 | `openai/gpt-5.5` | `reasoningEffort: high` |
| Gemini 3.1 Pro Preview | `google/gemini-3.1-pro-preview` | `thinkingConfig` |
| DeepSeek V3.2 Thinking | `deepseek/deepseek-v3.2-thinking` | intrinsic |
| Kimi K2 Thinking | `moonshotai/kimi-k2-thinking` | intrinsic |
| SPY · QQQ | — | passive buy-and-hold controls |

Decisions use **`generateText` + a JSON parse/validate step** (with one repair
retry), not `generateObject`: forcing a tool call is incompatible with extended
thinking and brittle for open models.

---

## Running with real models + market data

1. **Supabase** — create a project, run [`supabase/schema.sql`](supabase/schema.sql)
   in the SQL editor.
2. **Env** — copy `.env.example` to `.env.local` and fill in:
   - `AI_GATEWAY_API_KEY` (Vercel AI Gateway; enables real models)
   - `TWELVEDATA_API_KEY` (Twelve Data; enables real prices — broad free US coverage)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (protects the cron/step/dev routes)
3. **Seed + run:**
   ```bash
   npm run seed                                   # creates the experiment in Supabase
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
        "http://localhost:3000/api/cron/step?day=2026-06-15"
   ```

The presence of the keys flips the modes automatically: `AI_GATEWAY_API_KEY`
→ real models, `TWELVEDATA_API_KEY` → real prices, `SUPABASE_URL` → Supabase store.
Force any of them with `STORE=memory|file|supabase`, `MOCK_MODELS=1|0`, `MOCK_PRICES=1`.

---

## Deploying to Vercel

1. Import the repo; set the env vars above in Project Settings (server-side; the
   `NEXT_PUBLIC_*` keys are only needed if you later add client-side reads).
2. [`vercel.json`](vercel.json) registers the daily cron at `0 21 * * 1-5`
   (21:00 UTC, weekdays — after the US close). **Vercel Cron facts (re-verify):**
   Hobby fires once/day with ±59-min precision (fine for an after-close step);
   precise/sub-daily timing needs Pro.
3. `maxDuration` is set per route: orchestrator 300s (it performs the
   rate-limited snapshot fetch), worker 300s — raise toward 800 on Pro for slow
   reasoning models.
4. Set `APP_BASE_URL` to the deployment URL (or rely on `VERCEL_URL`) so the
   orchestrator can self-invoke the per-participant worker.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm test` | Unit + engine integration tests (Node test runner via tsx) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Seed an experiment into the configured store |

---

## Project layout

```
app/
  page.tsx                  leaderboard (latest experiment)
  experiment/[id]/page.tsx  leaderboard + equity curves for one experiment
  participant/[id]/page.tsx holdings, decision journal, trades
  api/cron/step/route.ts    orchestrator (cron target)
  api/step/route.ts         per-participant worker
  api/dev/{tick,seed}/route.ts  on-demand local driver
lib/
  config.ts                 universe, rules, roster, system prompt
  decision.ts + decision-schema.ts   context builder, Zod schema, model call, mock
  referee.ts                pure order validation  (unit-tested)
  ledger.ts                 pure fills / cost basis / NAV  (unit-tested)
  engine/tick.ts            daily-tick orchestration + idempotency  (integration-tested)
  passive.ts                SPY/QQQ buy-and-hold controls
  market/{twelvedata,mock,indicators,calendar}.ts   prices + indicators
  store/{file,memory,supabase,index}.ts             persistence abstraction
supabase/schema.sql         8 tables + RLS read policies
```

---

## Verification

`npm test` covers the correctness-critical core: the referee (cap/cash/holdings
clipping, no-shorting, min-order, daily cap), the ledger (fractional fills,
average cost, realized/unrealized P&L, **NAV reconciles to the penny**), the
indicators (no look-ahead), and an end-to-end engine run proving the daily step
is **idempotent** (re-running a day changes nothing).

---

## Known limits (deliberate scope)

- **Price-only inputs** — no fundamentals/news/filings, so this tests short-horizon
  trading more than research-driven investing. Upgrade path: a "price + fundamentals
  + news" tier that doesn't touch the engine.
- **Live-forward only** — no historical-replay engine (replay of a past month would
  be contaminated by models' training data). The `Clock`/`PriceSource` seam is left
  in for a future replay mode.
- **Market holidays** aren't modeled; **Sharpe/win-rate** are deferred (the ~21-day
  sample is statistically thin); a single model call per day carries real variance.

This is a simulation. Nothing here is financial advice.
