// Paper-trading ledger — pure accounting, no LLM, no I/O.
//
// Consumes the referee's ExecutionReport (which already sized every order),
// applies fills to a portfolio, and marks NAV. Buys recompute average cost;
// sells realize P&L against average cost and leave it unchanged. Commissions
// and slippage are $0 for the alpha and slot in behind `priceWithCosts`.

import { isApproxZero, round2, round8 } from "@/lib/money";
import { markPriceOf } from "@/lib/pricing";
import type {
  ExecutionReport,
  MarketSnapshot,
  PortfolioState,
  PortfolioView,
  Position,
  PositionView,
  Side,
} from "@/lib/types";

export interface Fill {
  ticker: string;
  side: Side;
  shares: number;
  fillPrice: number;
  notional: number;
  realizedPnl: number | null; // set on sells
}

export interface ApplyResult {
  portfolio: PortfolioState;
  fills: Fill[];
}

/** Seam for future transaction costs. Today an identity function. */
export function priceWithCosts(_side: Side, rawPrice: number): number {
  return rawPrice;
}

function clonePortfolio(p: PortfolioState): PortfolioState {
  return { cash: p.cash, positions: p.positions.map((pos) => ({ ...pos })) };
}

/** Apply all accepted/clipped fills from a report to a portfolio (immutably). */
export function applyExecution(
  portfolio: PortfolioState,
  report: ExecutionReport,
): ApplyResult {
  const next = clonePortfolio(portfolio);
  const byTicker = new Map<string, Position>();
  for (const pos of next.positions) byTicker.set(pos.ticker, pos);
  const fills: Fill[] = [];

  for (const o of report.orders) {
    if (o.status === "rejected") continue;
    if (o.fillPrice == null || o.finalShares <= 0 || isApproxZero(o.finalShares)) continue;

    const price = priceWithCosts(o.side, o.fillPrice);

    if (o.side === "buy") {
      let pos = byTicker.get(o.ticker);
      if (!pos) {
        pos = { ticker: o.ticker, shares: 0, avgCost: 0, realizedPnl: 0 };
        byTicker.set(o.ticker, pos);
        next.positions.push(pos);
      }
      const newShares = round8(pos.shares + o.finalShares);
      const cost = round2(pos.shares * pos.avgCost + o.finalShares * price);
      pos.avgCost = newShares > 0 ? round8(cost / newShares) : 0;
      pos.shares = newShares;
      next.cash = round2(next.cash - o.finalNotional);
      fills.push({
        ticker: o.ticker,
        side: "buy",
        shares: o.finalShares,
        fillPrice: round2(price),
        notional: o.finalNotional,
        realizedPnl: null,
      });
    } else {
      const pos = byTicker.get(o.ticker);
      if (!pos || pos.shares <= 0) continue;
      const sellShares = Math.min(o.finalShares, pos.shares);
      const realized = round2(sellShares * (price - pos.avgCost));
      pos.shares = round8(pos.shares - sellShares);
      pos.realizedPnl = round2(pos.realizedPnl + realized);
      if (isApproxZero(pos.shares)) pos.shares = 0; // clear fractional dust
      next.cash = round2(next.cash + o.finalNotional);
      fills.push({
        ticker: o.ticker,
        side: "sell",
        shares: sellShares,
        fillPrice: round2(price),
        notional: o.finalNotional,
        realizedPnl: realized,
      });
    }
  }

  return { portfolio: next, fills };
}

export interface NavBreakdown {
  cash: number;
  investedValue: number;
  nav: number;
}

/** Mark the portfolio to the snapshot's close prices. NAV = cash + Σ value. */
export function computeNav(
  portfolio: PortfolioState,
  snapshot: MarketSnapshot,
): NavBreakdown {
  let investedValue = 0;
  for (const pos of portfolio.positions) {
    if (pos.shares <= 0 || isApproxZero(pos.shares)) continue;
    const mark = markPriceOf(snapshot.tickers[pos.ticker]) ?? pos.avgCost;
    investedValue = round2(investedValue + round2(pos.shares * mark));
  }
  const cash = round2(portfolio.cash);
  return { cash, investedValue, nav: round2(cash + investedValue) };
}

/** Portfolio enriched with per-position marks — for the decision context and UI. */
export function buildPortfolioView(
  portfolio: PortfolioState,
  snapshot: MarketSnapshot,
): PortfolioView {
  const { cash, investedValue, nav } = computeNav(portfolio, snapshot);
  const positions: PositionView[] = portfolio.positions
    .filter((p) => p.shares > 0 && !isApproxZero(p.shares))
    .map((p) => {
      const lastPrice = markPriceOf(snapshot.tickers[p.ticker]);
      const marketValue = round2(p.shares * (lastPrice ?? p.avgCost));
      const cost = round2(p.shares * p.avgCost);
      const unrealizedPnl = lastPrice == null ? null : round2(marketValue - cost);
      const unrealizedPnlPct =
        lastPrice == null || cost === 0 ? null : round8((marketValue - cost) / cost);
      return {
        ...p,
        lastPrice,
        marketValue,
        unrealizedPnl,
        unrealizedPnlPct,
        pctOfNav: nav > 0 ? round8(marketValue / nav) : 0,
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue);

  return { cash, nav, investedValue, positions };
}
