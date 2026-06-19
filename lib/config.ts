// Experiment configuration: the tradeable universe, deterministic rules,
// the starting model roster, shared model params, and the shared system
// prompt. The seed script copies these into an `experiments` row so a run is
// fully reproducible and every fairness variable is pinned in one place.

import type { ModelParams, ParticipantConfig, Rules } from "@/lib/types";

export const STARTING_CASH = 1000;

/** Tradeable universe — a liquid subset of the PRD watchlist across themes. */
export const DEFAULT_UNIVERSE: string[] = [
  // AI infrastructure / compute
  "NVDA", "AMD", "AVGO", "MU", "ANET", "DELL",
  // Power / energy / grid
  "GEV", "VRT", "CEG", "VST", "CCJ",
  // Product-led software / applications
  "CRM", "NOW", "SHOP",
  // Defense
  "PLTR", "RKLB",
  // Healthcare innovation
  "TEM", "HIMS",
];

/** Passive benchmarks. Priced and charted, but never traded by the models. */
export const BENCHMARK_TICKERS: string[] = ["SPY", "QQQ"];

/** All tickers we need daily prices for (universe + benchmarks, de-duplicated). */
export const PRICED_TICKERS: string[] = Array.from(
  new Set([...DEFAULT_UNIVERSE, ...BENCHMARK_TICKERS]),
);

export const DEFAULT_RULES: Rules = {
  maxPositionPctOfNav: 0.2,
  minCashReservePct: 0.05,
  maxOrdersPerDay: 10,
  minOrderUsd: 1,
  allowShorting: false,
  allowLeverage: false,
  allowOptions: false,
  universe: DEFAULT_UNIVERSE,
};

export const DEFAULT_MODEL_PARAMS: ModelParams = {
  temperature: 0.3,
  maxOutputTokens: 1500,
  seed: 7, // honored only by providers that support deterministic sampling
};

/**
 * Starting roster. Edit freely — the seed script materializes these.
 *
 * ⚠️ Model IDs must be confirmed against the live AI Gateway catalog
 * (https://vercel.com/ai-gateway/models) before a run; provider/version slugs
 * change over time. The passive SPY/QQQ controls require no model access.
 */
export const DEFAULT_ROSTER: ParticipantConfig[] = [
  { modelId: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5", kind: "llm" },
  { modelId: "openai/gpt-5.1", label: "GPT-5.1", kind: "llm" },
  { modelId: "google/gemini-3-pro", label: "Gemini 3 Pro", kind: "llm" },
  { modelId: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", kind: "llm" },
  { modelId: "__passive__", label: "SPY Buy & Hold", kind: "passive", benchmarkTicker: "SPY" },
  { modelId: "__passive__", label: "QQQ Buy & Hold", kind: "passive", benchmarkTicker: "QQQ" },
];

/**
 * Shared system prompt — IDENTICAL for every model (no per-model interpolation;
 * only the `model` argument of the API call differs). Hard rules here are
 * advisory to the model but ENFORCED by the deterministic referee, which clips
 * or rejects invalid orders regardless of what the model returns.
 */
export const SYSTEM_PROMPT = `You are an autonomous portfolio manager competing in a controlled benchmark.
You manage a virtual $${STARTING_CASH} portfolio of US equities over a roughly one-month experiment, making one decision per trading day. Your single objective is to maximize total portfolio return over the experiment while respecting the rules below. This is a simulation with fake money — no real trades occur — and nothing here is financial advice.

WHAT YOU RECEIVE EACH DAY
- A market snapshot for a fixed universe of tickers: latest prices and simple indicators (1-day and 5-day % change, 20- and 50-day moving averages, % below the 20-day high). All features are computed through the PRIOR trading day's close — you cannot see today's closing price when deciding.
- Your current portfolio: cash, positions (shares, average cost, unrealized P&L, % of NAV) and net asset value (NAV).
- Your recent decision journal (your own prior theses).

HARD RULES (a deterministic risk engine enforces these and will clip or reject anything that violates them)
- Long only. No short selling, no leverage, no options, no derivatives.
- Trade only tickers in the provided universe.
- No single position may exceed {{MAX_POSITION_PCT}}% of NAV.
- Keep at least {{MIN_CASH_PCT}}% of NAV in cash at all times.
- At most {{MAX_ORDERS}} orders per day; each order is at least {{MIN_ORDER}} US dollars.

HOW ORDERS WORK
- Orders are dollar amounts (notional), not share counts. Fractional shares are allowed, so "buy $150 of NVDA" is valid.
- Orders fill at the next available market open; you will not get today's close as your fill price.
- To exit a position completely, set "closePosition": true on a sell order (the notional is then ignored). For normal orders set "closePosition": false.
- Holding is a valid, non-penalized choice: return an empty "orders" array on days you don't want to trade.

APPROACH
- Favor durable, structural-growth businesses; be skeptical of hype and overextended moves. Think about concentration and downside, not just upside.
- You only have the data provided. Do not invent prices, news, fundamentals or events. You have no web access or tools.

OUTPUT
- Return only structured output matching the provided schema: a brief thesis, a confidence in [0,1], a market outlook, and your orders.`;

/** Fill the rule placeholders in the system prompt for a given ruleset. */
export function renderSystemPrompt(rules: Rules): string {
  return SYSTEM_PROMPT.replace("{{MAX_POSITION_PCT}}", String(rules.maxPositionPctOfNav * 100))
    .replace("{{MIN_CASH_PCT}}", String(rules.minCashReservePct * 100))
    .replace("{{MAX_ORDERS}}", String(rules.maxOrdersPerDay))
    .replace("{{MIN_ORDER}}", String(rules.minOrderUsd));
}
