/* eslint-disable @typescript-eslint/no-explicit-any */
// Twelve Data market-data client + SnapshotProvider (broad free US coverage).
//
// Free tier: ~8 API credits/min, ~800/day. We fetch daily bars in batches of
// <= 7 symbols/request and wait between chunks to stay under the per-minute
// limit (a ~20-symbol universe → a couple of minutes once per day, well under
// the daily budget). Prices arrive as strings, newest-first. Degrades a missing
// or errored symbol to an all-null snapshot — never fabricates prices.

import { computeTickerSnapshot, type DailyBar } from "@/lib/market/indicators";
import type { SnapshotProvider } from "@/lib/engine/tick";

const TD_BASE = "https://api.twelvedata.com";
const CHUNK = 7; // <= 8 credits/min on the free plan
const GAP_MS = 61_000; // pause between chunks to respect the per-minute limit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, timeoutMs = 15_000, retries = 1): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseValues(obj: any): DailyBar[] {
  if (!obj || obj.status !== "ok" || !Array.isArray(obj.values)) return [];
  return obj.values
    .map((v: any) => ({
      date: v.datetime,
      open: v.open != null ? Number(v.open) : null,
      close: v.close != null ? Number(v.close) : null,
    }))
    .reverse(); // newest-first → ascending
}

/** One batch request for up to CHUNK symbols → bars per symbol (ascending). */
async function fetchChunk(symbols: string[], limit: number, key: string): Promise<Map<string, DailyBar[]>> {
  const out = new Map<string, DailyBar[]>();
  const url =
    `${TD_BASE}/time_series?symbol=${symbols.map(encodeURIComponent).join(",")}` +
    `&interval=1day&outputsize=${limit}&apikey=${key}`;
  let data: any;
  try {
    data = await fetchJson(url);
  } catch {
    for (const s of symbols) out.set(s, []); // degrade whole chunk
    return out;
  }
  // Single-symbol responses are flat; multi-symbol responses are keyed by symbol.
  if (symbols.length === 1) {
    out.set(symbols[0], parseValues(data));
  } else {
    for (const s of symbols) out.set(s, parseValues(data?.[s]));
  }
  return out;
}

export function createTwelveDataSnapshotProvider(): SnapshotProvider {
  return async (tickers, tradingDay) => {
    const key = process.env.TWELVEDATA_API_KEY;
    if (!key) throw new Error("TWELVEDATA_API_KEY is required.");

    const chunks: string[][] = [];
    for (let i = 0; i < tickers.length; i += CHUNK) chunks.push(tickers.slice(i, i + CHUNK));

    const bars = new Map<string, DailyBar[]>();
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(GAP_MS); // respect the per-minute credit limit
      const got = await fetchChunk(chunks[i], 70, key);
      for (const [s, b] of got) bars.set(s, b);
    }
    return tickers.map((t) => computeTickerSnapshot(t, bars.get(t) ?? [], tradingDay));
  };
}
