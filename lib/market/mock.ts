// Deterministic synthetic price provider for zero-key local demos and tests.
// Prices are a function of the ABSOLUTE calendar day (not position in a
// window), so consecutive trading days genuinely move and equity curves
// evolve. A two-frequency sine, phase-seeded per ticker, keeps moves bounded
// (~±9%) and reproducible. Never used when a real provider is configured.

import { computeTickerSnapshot, type DailyBar } from "@/lib/market/indicators";
import { round2 } from "@/lib/money";
import type { SnapshotProvider } from "@/lib/engine/tick";

const MS_PER_DAY = 86_400_000;
const REF_DAY = Math.floor(Date.UTC(2020, 0, 1) / MS_PER_DAY);

function seed(ticker: string): number {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function dayOrdinal(dateISO: string): number {
  return Math.floor(Date.parse(`${dateISO}T00:00:00Z`) / MS_PER_DAY) - REF_DAY;
}

function isoFromOrdinal(k: number): string {
  return new Date((k + REF_DAY) * MS_PER_DAY).toISOString().slice(0, 10);
}

function priceAt(base: number, phase: number, k: number): number {
  return base * (1 + 0.06 * Math.sin((k + phase) / 5) + 0.03 * Math.sin((k + phase) / 2));
}

function synthBars(ticker: string, tradingDay: string, n = 60): DailyBar[] {
  const h = seed(ticker);
  const base = 20 + (h % 380); // $20–$400
  const phase = h % 11;
  const endK = dayOrdinal(tradingDay);

  const bars: DailyBar[] = [];
  for (let k = endK - (n - 1); k <= endK; k++) {
    bars.push({
      date: isoFromOrdinal(k),
      open: round2(priceAt(base, phase, k - 0.25)), // intraday offset so open ≠ close
      close: round2(priceAt(base, phase, k)),
    });
  }
  return bars;
}

export function createMockSnapshotProvider(): SnapshotProvider {
  return async (tickers, tradingDay) =>
    tickers.map((t) => computeTickerSnapshot(t, synthBars(t, tradingDay), tradingDay));
}
