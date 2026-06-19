// Pure, deterministic indicator computation. Features are derived ONLY from
// closes through the PRIOR trading day (T-1) so the model never sees the bar it
// trades into. open_T / close_T are carried through for fills and NAV marking.

import { pctChange, round8 } from "@/lib/money";
import type { TickerSnapshot } from "@/lib/types";

export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number | null;
  close: number | null;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Build a snapshot for `ticker` on `tradingDay` from ascending daily bars.
 * The target bar is the latest with date <= tradingDay. Indicators use the
 * closes strictly before it.
 */
export function computeTickerSnapshot(
  ticker: string,
  barsAsc: DailyBar[],
  tradingDay: string,
): TickerSnapshot {
  const empty: TickerSnapshot = {
    ticker,
    open: null,
    close: null,
    prevClose: null,
    pctChange1d: null,
    pctChange5d: null,
    sma20: null,
    sma50: null,
    pctFrom20dHigh: null,
  };
  if (barsAsc.length === 0) return empty;

  let idx = -1;
  for (let i = 0; i < barsAsc.length; i++) {
    if (barsAsc[i].date <= tradingDay) idx = i;
  }
  if (idx === -1) idx = barsAsc.length - 1; // all bars after tradingDay → use latest

  const today = barsAsc[idx];
  const priorCloses = barsAsc
    .slice(0, idx)
    .map((b) => b.close)
    .filter((c): c is number => c != null);

  const prevClose = priorCloses.at(-1) ?? null;
  const closeTminus2 = priorCloses.at(-2) ?? null;
  const closeTminus6 = priorCloses.length >= 6 ? priorCloses[priorCloses.length - 6] : null;
  const last20 = priorCloses.slice(-20);
  const max20 = last20.length > 0 ? Math.max(...last20) : null;

  return {
    ticker,
    open: today.open ?? null,
    close: today.close ?? null,
    prevClose,
    pctChange1d: pctChange(closeTminus2, prevClose),
    pctChange5d: pctChange(closeTminus6, prevClose),
    sma20: last20.length >= 20 ? round8(mean(last20)) : null,
    sma50: priorCloses.length >= 50 ? round8(mean(priorCloses.slice(-50))) : null,
    pctFrom20dHigh:
      max20 != null && prevClose != null && max20 > 0 ? round8((prevClose - max20) / max20) : null,
  };
}
