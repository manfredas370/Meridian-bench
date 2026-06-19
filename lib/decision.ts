// The model-trader decision layer: builds the per-day context, calls the model
// through the Vercel AI Gateway (or a deterministic mock for offline runs), and
// returns a validated DecisionOutput plus telemetry. The system prompt and
// model params are identical for every participant — only `modelId` differs.

import { generateObject } from "ai";

import { type DecisionOutput, makeDecisionSchema } from "@/lib/decision-schema";
import { round2 } from "@/lib/money";
import { fillPriceOf } from "@/lib/pricing";
import type { MarketSnapshot, ModelParams, PortfolioView, Rules } from "@/lib/types";

export interface DecisionContext {
  modelId: string;
  isMock: boolean;
  system: string;
  modelParams: ModelParams;
  rules: Rules;
}

export interface DecisionResult {
  decision: DecisionOutput;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  error: string | null;
}

const HOLD = (thesis: string): DecisionOutput => ({
  thesis,
  confidence: 0.5,
  marketOutlook: "neutral",
  orders: [],
});

export function modelsAreMocked(): boolean {
  const flag = process.env.MOCK_MODELS;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  // Default: mock when there's no gateway key (zero-config local demo).
  return !process.env.AI_GATEWAY_API_KEY;
}

const pct = (x: number | null) => (x == null ? "  n/a" : `${(x * 100).toFixed(1)}%`);
const usd = (x: number) => `$${x.toFixed(2)}`;

/** Build the user prompt — a compact market table + this participant's book. */
export function buildUserPrompt(
  snapshot: MarketSnapshot,
  portfolio: PortfolioView,
  recentTheses: string[],
  rules: Rules,
): string {
  const rows = rules.universe.map((t) => {
    const s = snapshot.tickers[t];
    const last = s ? (s.close ?? s.open ?? s.prevClose) : null;
    return [
      t.padEnd(6),
      (last == null ? "n/a" : last.toFixed(2)).padStart(9),
      pct(s?.pctChange1d ?? null).padStart(7),
      pct(s?.pctChange5d ?? null).padStart(7),
      pct(s?.pctFrom20dHigh ?? null).padStart(9),
      (s?.sma20 == null ? "n/a" : s.sma20.toFixed(2)).padStart(9),
      (s?.sma50 == null ? "n/a" : s.sma50.toFixed(2)).padStart(9),
    ].join(" ");
  });
  const header = ["TICKER", "last", "1d%", "5d%", "vs20dHi", "sma20", "sma50"]
    .map((h, i) => (i === 0 ? h.padEnd(6) : h.padStart(i === 4 || i >= 5 ? 9 : 7)))
    .join(" ");

  const positions =
    portfolio.positions.length === 0
      ? "  (none — fully in cash)"
      : portfolio.positions
          .map(
            (p) =>
              `  ${p.ticker}: ${p.shares.toFixed(4)} sh @ avg ${usd(p.avgCost)}, ` +
              `value ${usd(p.marketValue)} (${(p.pctOfNav * 100).toFixed(1)}% of NAV), ` +
              `unrealized ${p.unrealizedPnlPct == null ? "n/a" : pct(p.unrealizedPnlPct)}`,
          )
          .join("\n");

  const notes =
    recentTheses.length === 0
      ? "  (no prior notes)"
      : recentTheses.map((t, i) => `  ${i + 1}. ${t}`).join("\n");

  const cashPct = portfolio.nav > 0 ? (portfolio.cash / portfolio.nav) * 100 : 0;

  return `Trading day: ${snapshot.tradingDay}

MARKET (features computed through the prior close; you fill at the next open):
${header}
${rows.join("\n")}

YOUR PORTFOLIO:
  NAV ${usd(portfolio.nav)} | Cash ${usd(portfolio.cash)} (${cashPct.toFixed(1)}% of NAV)
${positions}

YOUR RECENT NOTES (most recent first):
${notes}

Decide today's orders. Holding (an empty orders array) is allowed.`;
}

/** Deterministic offline trader: allocate cash to top 5-day-momentum names. */
function mockDecision(
  snapshot: MarketSnapshot,
  portfolio: PortfolioView,
  rules: Rules,
  modelId: string,
): DecisionOutput {
  const cands = rules.universe
    .map((t) => ({ t, s: snapshot.tickers[t] }))
    .filter((x) => x.s && fillPriceOf(x.s) != null)
    .map((x) => ({ t: x.t, mom: x.s!.pctChange5d ?? x.s!.pctChange1d ?? 0 }))
    .sort((a, b) => b.mom - a.mom);
  if (cands.length === 0) return HOLD("No tradeable prices today; holding.");

  // Deterministic per-model basket (different start + size) so mock models diverge.
  let h = 0;
  for (const c of modelId) h = (h * 31 + c.charCodeAt(0)) | 0;
  h = Math.abs(h);
  const k = 2 + (h % 3); // 2–4 names
  const offset = h % Math.min(cands.length, 7);
  const picks: { t: string; mom: number }[] = [];
  for (let j = 0; j < cands.length && picks.length < k; j++) {
    const c = cands[(offset + j) % cands.length];
    if (!picks.includes(c)) picks.push(c);
  }

  const investable = round2(portfolio.cash - portfolio.nav * rules.minCashReservePct);
  if (investable < rules.minOrderUsd) return HOLD("Cash reserve reached; holding.");

  const positive = picks.filter((p) => p.mom > 0);
  if (positive.length === 0) return HOLD("No positive momentum; staying defensive.");

  const per = round2(investable / positive.length);
  if (per < rules.minOrderUsd) return HOLD("Too little investable cash to deploy; holding.");

  return {
    thesis: `Allocating to momentum leaders: ${positive.map((p) => p.t).join(", ")}.`,
    confidence: 0.6,
    marketOutlook: "bullish",
    orders: positive.map((p) => ({
      ticker: p.t,
      side: "buy" as const,
      notionalUsd: per,
      closePosition: false,
      rationale: `Top 5-day momentum (${pct(p.mom)}).`,
    })),
  };
}

/** Run one trading decision for a participant. Never throws — failures degrade
 *  to a logged "hold" (the fixed, fair failure policy for every model). */
export async function runDecision(
  ctx: DecisionContext,
  snapshot: MarketSnapshot,
  portfolio: PortfolioView,
  recentTheses: string[],
): Promise<DecisionResult> {
  if (ctx.isMock) {
    return {
      decision: mockDecision(snapshot, portfolio, ctx.rules, ctx.modelId),
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      error: null,
    };
  }

  const prompt = buildUserPrompt(snapshot, portfolio, recentTheses, ctx.rules);
  const schema = makeDecisionSchema(ctx.rules.universe);
  const started = Date.now();
  try {
    const result = await generateObject({
      model: ctx.modelId,
      schema,
      system: ctx.system,
      prompt,
      temperature: ctx.modelParams.temperature,
      maxOutputTokens: ctx.modelParams.maxOutputTokens,
      maxRetries: 1,
      ...(ctx.modelParams.seed != null ? { seed: ctx.modelParams.seed } : {}),
    });
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined;
    return {
      decision: result.object as DecisionOutput,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      latencyMs: Date.now() - started,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      decision: HOLD("Model call failed; holding for today."),
      inputTokens: null,
      outputTokens: null,
      latencyMs: Date.now() - started,
      error: message,
    };
  }
}
