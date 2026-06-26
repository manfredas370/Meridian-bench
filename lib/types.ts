// Core domain types for Meridian Bench.
// These are pure data shapes shared across the engine, referee, ledger and UI.
// Money is held as plain numbers but every monetary mutation is routed through
// the rounding helpers in `lib/money.ts` so portfolios reconcile to the penny.

export type Side = "buy" | "sell";
export type MarketOutlook = "bullish" | "neutral" | "bearish";
export type ParticipantKind = "llm" | "passive";

/** Compact fundamentals for one ticker (slow-moving; as of the prior close). */
export interface Fundamentals {
  peTTM: number | null;
  psTTM: number | null;
  grossMarginTTM: number | null; // %
  revenueGrowthYoY: number | null; // %
  roeTTM: number | null; // %
  week52High: number | null;
  week52Low: number | null;
  /** Analyst recommendation tallies for the latest period. */
  analyst: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
}

/** A recent headline (dated through the prior close — no look-ahead). */
export interface NewsItem {
  date: string; // YYYY-MM-DD
  headline: string;
}

/** One ticker's shared daily market state. Identical bytes for every participant. */
export interface TickerSnapshot {
  ticker: string;
  /** Day-T open — the fill price (we transact at the next available open). */
  open: number | null;
  /** Day-T close — used to mark NAV / equity curve. */
  close: number | null;
  /** Prior trading day (T-1) close. */
  prevClose: number | null;
  /** Features below are computed through the prior close (T-1) — no look-ahead. */
  pctChange1d: number | null;
  pctChange5d: number | null;
  sma20: number | null;
  sma50: number | null;
  pctFrom20dHigh: number | null;
  /** Fundamentals + news tier (only present on "fundamentals" experiments). */
  fundamentals?: Fundamentals | null;
  news?: NewsItem[];
}

/** The shared market snapshot for a single trading day. */
export interface MarketSnapshot {
  tradingDay: string; // ISO date, YYYY-MM-DD
  tickers: Record<string, TickerSnapshot>;
}

export interface Position {
  ticker: string;
  shares: number;
  avgCost: number; // average cost per share
  realizedPnl: number;
}

/** Objective portfolio state (what the ledger mutates). */
export interface PortfolioState {
  cash: number;
  positions: Position[];
}

/** A position enriched with current marks, for the decision context + UI. */
export interface PositionView extends Position {
  lastPrice: number | null;
  marketValue: number;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  pctOfNav: number;
}

/** Portfolio enriched with marks. Fed to the model and rendered in the UI. */
export interface PortfolioView {
  cash: number;
  nav: number;
  investedValue: number;
  positions: PositionView[];
}

/** Deterministic, human-editable trading constraints. Enforced by the referee. */
export interface Rules {
  maxPositionPctOfNav: number; // e.g. 0.20 — no single name above 20% of NAV
  minCashReservePct: number; // e.g. 0.05 — keep at least 5% in cash
  maxOrdersPerDay: number; // e.g. 10
  minOrderUsd: number; // e.g. 1 — kills dust orders
  allowShorting: boolean; // false
  allowLeverage: boolean; // false
  allowOptions: boolean; // false
  universe: string[]; // canonical tradeable set
}

export interface ModelParams {
  temperature: number;
  maxOutputTokens: number;
  seed?: number;
}

/** Per-model call overrides (reasoning/effort), keyed by model in config. */
export interface ModelCallConfig {
  maxOutputTokens?: number;
  /** number → use it; null → omit temperature (reasoning models); undefined → global default. */
  temperature?: number | null;
  /** Provider-keyed options forwarded to generateObject (thinking budgets, reasoningEffort, …). */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/** One competitor in an experiment. */
export interface ParticipantConfig {
  /** AI Gateway model id (e.g. "openai/gpt-5.1"), or a sentinel for passive bots. */
  modelId: string;
  label: string;
  kind: ParticipantKind;
  /** For passive buy-and-hold controls: the ticker to hold (e.g. "SPY"). */
  benchmarkTicker?: string;
}

// ── Referee output ──────────────────────────────────────────────────────────

export type OrderStatus = "accepted" | "clipped" | "rejected";

export type OrderReasonCode =
  | "UNKNOWN_TICKER"
  | "NO_PRICE"
  | "NON_POSITIVE_QTY"
  | "BELOW_MIN_ORDER"
  | "MAX_ORDERS_EXCEEDED"
  | "SELL_NO_POSITION"
  | "SELL_CLIPPED_TO_HOLDINGS"
  | "INSUFFICIENT_CASH"
  | "POSITION_CAP_CLIPPED"
  | "DUPLICATE_MERGED";

export interface ValidatedOrder {
  ticker: string;
  side: Side;
  requestedNotional: number;
  finalNotional: number; // 0 when rejected
  finalShares: number; // always >= 0; `side` carries the direction
  fillPrice: number | null;
  status: OrderStatus;
  reasonCode: OrderReasonCode | null;
  note: string;
  closePosition: boolean;
}

export interface ExecutionReport {
  orders: ValidatedOrder[];
  acceptedCount: number;
  clippedCount: number;
  rejectedCount: number;
}
