// Financial Modeling Prep market-data client + SnapshotProvider.
//
// Prices only (no fundamentals/news in the alpha). Fetches daily OHLC bars,
// converts them to deterministic per-ticker snapshots, and degrades to an
// all-null snapshot on failure (never fabricates prices). Bounded concurrency
// via p-limit.
//
// NOTE: endpoint/plan entitlements must be verified for your FMP subscription.

import pLimit from "p-limit";

import { computeTickerSnapshot, type DailyBar } from "@/lib/market/indicators";
import type { SnapshotProvider } from "@/lib/engine/tick";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";

async function fetchJson(url: string, timeoutMs = 12_000, retries = 1): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`FMP HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Daily OHLC bars for a ticker, ascending (oldest first). */
export async function fetchDailyBars(ticker: string, limit = 70): Promise<DailyBar[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY is required.");
  const url = `${FMP_BASE}/historical-price-full/${encodeURIComponent(ticker)}?timeseries=${limit}&apikey=${key}`;
  const data = (await fetchJson(url)) as { historical?: Array<{ date: string; open?: number; close?: number }> };
  const hist = data?.historical ?? [];
  return hist
    .map((h) => ({ date: h.date, open: h.open ?? null, close: h.close ?? null }))
    .reverse(); // FMP returns newest-first
}

export function createFmpSnapshotProvider(): SnapshotProvider {
  const limit = pLimit(5);
  return async (tickers, tradingDay) => {
    return Promise.all(
      tickers.map((ticker) =>
        limit(async () => {
          try {
            const bars = await fetchDailyBars(ticker);
            return computeTickerSnapshot(ticker, bars, tradingDay);
          } catch {
            // Degrade gracefully: an all-null snapshot → referee treats as NO_PRICE.
            return computeTickerSnapshot(ticker, [], tradingDay);
          }
        }),
      ),
    );
  };
}
