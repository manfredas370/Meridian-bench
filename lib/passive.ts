// Passive buy-and-hold control (e.g. SPY, QQQ). NOT subject to the trader
// rules — a 100%-in-one-ETF benchmark would violate the position cap — so it
// bypasses the referee entirely. On the first day it has cash it invests
// everything in its benchmark ticker, then holds. It is the bar every model
// must beat.

import type { Fill } from "@/lib/ledger";
import { round2, round8 } from "@/lib/money";
import { fillPriceOf } from "@/lib/pricing";
import type { MarketSnapshot, PortfolioState } from "@/lib/types";

export function passiveExecution(
  state: PortfolioState,
  snapshot: MarketSnapshot,
  benchmarkTicker: string,
): { portfolio: PortfolioState; fills: Fill[] } {
  const price = fillPriceOf(snapshot.tickers[benchmarkTicker]);
  const held = state.positions.find((p) => p.ticker === benchmarkTicker);

  // Already invested, or no price today → hold.
  if (price == null || price <= 0) return { portfolio: state, fills: [] };
  if (held && held.shares > 0) return { portfolio: state, fills: [] };

  const cash = round2(state.cash);
  const shares = round8(cash / price);
  if (shares <= 0) return { portfolio: state, fills: [] };

  const cost = round2(shares * price);
  const positions = state.positions.filter((p) => p.ticker !== benchmarkTicker);
  positions.push({ ticker: benchmarkTicker, shares, avgCost: round8(price), realizedPnl: 0 });

  return {
    portfolio: { cash: round2(cash - cost), positions },
    fills: [
      {
        ticker: benchmarkTicker,
        side: "buy",
        shares,
        fillPrice: round2(price),
        notional: cost,
        realizedPnl: null,
      },
    ],
  };
}
