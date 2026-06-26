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

// Deterministic mock fundamentals + news so the fundamentals tier can be
// exercised offline (no Finnhub key). Values are seeded per ticker.
import type { FundamentalsProvider } from "@/lib/market/finnhub";

export function createMockFundamentalsProvider(): FundamentalsProvider {
  return async (tickers, tradingDay) =>
    Object.fromEntries(
      tickers.map((t) => {
        const h = seed(t);
        const base = 20 + (h % 380);
        return [
          t,
          {
            fundamentals: {
              peTTM: round2(12 + (h % 60)),
              psTTM: round2(2 + (h % 18)),
              grossMarginTTM: round2(35 + (h % 50)),
              revenueGrowthYoY: round2(-5 + (h % 60)),
              roeTTM: round2(5 + (h % 40)),
              week52High: round2(base * 1.3),
              week52Low: round2(base * 0.7),
              analyst: { strongBuy: h % 20, buy: h % 25, hold: h % 10, sell: h % 4, strongSell: h % 2 },
            },
            news: [{ date: tradingDay, headline: `${t}: mock headline (offline — no live news).` }],
          },
        ];
      }),
    );
}
