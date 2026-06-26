// Fundamentals + analyst + news provider (Finnhub free tier). Fetched once per
// trading day for the shared universe and stored on the snapshot, so it is the
// same for every model (fairness) — only present on "fundamentals"-tier runs.
//
// No look-ahead: news is windowed through the PRIOR close (≤ T-1); fundamentals
// are slow-moving "as of" the latest available. Live-forward only — we never
// backfill historical news (that would leak training-cutoff outcomes).

import pLimit from "p-limit";

import type { Fundamentals, NewsItem } from "@/lib/types";

export type FundamentalsBundle = { fundamentals: Fundamentals | null; news: NewsItem[] };
export type FundamentalsProvider = (
  tickers: string[],
  tradingDay: string,
) => Promise<Record<string, FundamentalsBundle>>;

const BASE = "https://finnhub.io/api/v1";
const NEWS_LOOKBACK_DAYS = 7;
const MAX_NEWS = 4;

/** Company names for news-relevance filtering. */
const NAMES: Record<string, string[]> = {
  NVDA: ["nvidia"], AMD: ["amd", "advanced micro"], AVGO: ["broadcom"], MU: ["micron"],
  ANET: ["arista"], DELL: ["dell"], GEV: ["ge vernova", "vernova"], VRT: ["vertiv"],
  CEG: ["constellation"], VST: ["vistra"], CCJ: ["cameco"], CRM: ["salesforce"],
  NOW: ["servicenow"], SHOP: ["shopify"], PLTR: ["palantir"], RKLB: ["rocket lab", "rocketlab"],
  TEM: ["tempus"], HIMS: ["hims", "hers"],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fjson(url: string, timeoutMs = 12_000, retries = 1): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 429 && attempt < retries) {
        await sleep(1500);
        continue;
      }
      if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(800);
    } finally {
      clearTimeout(timer);
    }
  }
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

function pickNews(raw: any[], ticker: string, before: string): NewsItem[] {
  const cutoff = Date.parse(`${before}T23:59:59Z`) / 1000; // ≤ prior close
  const keys = [ticker.toLowerCase(), ...(NAMES[ticker] ?? [])];
  const items = (Array.isArray(raw) ? raw : [])
    .filter((a) => typeof a?.datetime === "number" && a.datetime <= cutoff && a?.headline)
    .map((a) => ({ date: new Date(a.datetime * 1000).toISOString().slice(0, 10), headline: String(a.headline), t: a.datetime }))
    .sort((a, b) => b.t - a.t);
  const relevant = items.filter((a) => keys.some((k) => a.headline.toLowerCase().includes(k)));
  const chosen = (relevant.length ? relevant : items).slice(0, MAX_NEWS);
  return chosen.map(({ date, headline }) => ({ date, headline }));
}

export function createFinnhubProvider(): FundamentalsProvider {
  return async (tickers, tradingDay) => {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) throw new Error("FINNHUB_API_KEY is required for the fundamentals tier.");
    const from = addDays(tradingDay, -NEWS_LOOKBACK_DAYS);
    const to = addDays(tradingDay, -1); // through the prior close — no look-ahead
    const limit = pLimit(5);

    const entries = await Promise.all(
      tickers.map((ticker) =>
        limit(async (): Promise<[string, FundamentalsBundle]> => {
          const enc = encodeURIComponent(ticker);
          const [metricRes, recRes, newsRes] = await Promise.all([
            fjson(`${BASE}/stock/metric?symbol=${enc}&metric=all&token=${key}`).catch(() => null),
            fjson(`${BASE}/stock/recommendation?symbol=${enc}&token=${key}`).catch(() => null),
            fjson(`${BASE}/company-news?symbol=${enc}&from=${from}&to=${to}&token=${key}`).catch(() => null),
          ]);

          const m = metricRes?.metric ?? {};
          const r = Array.isArray(recRes) && recRes[0] ? recRes[0] : null;
          const fundamentals: Fundamentals | null = metricRes
            ? {
                peTTM: num(m.peTTM),
                psTTM: num(m.psTTM),
                grossMarginTTM: num(m.grossMarginTTM),
                revenueGrowthYoY: num(m.revenueGrowthTTMYoy),
                roeTTM: num(m.roeTTM),
                week52High: num(m["52WeekHigh"]),
                week52Low: num(m["52WeekLow"]),
                analyst: r
                  ? {
                      strongBuy: r.strongBuy ?? 0,
                      buy: r.buy ?? 0,
                      hold: r.hold ?? 0,
                      sell: r.sell ?? 0,
                      strongSell: r.strongSell ?? 0,
                    }
                  : null,
              }
            : null;

          return [ticker, { fundamentals, news: pickNews(newsRes, ticker, to) }];
        }),
      ),
    );
    return Object.fromEntries(entries);
  };
}
