import assert from "node:assert/strict";
import { test } from "node:test";

import { applyExecution, buildPortfolioView, computeNav } from "@/lib/ledger";
import { validateOrders } from "@/lib/referee";
import type {
  ExecutionReport,
  MarketSnapshot,
  PortfolioState,
  Position,
  Side,
  TickerSnapshot,
  ValidatedOrder,
} from "@/lib/types";

// ── Test helpers ──────────────────────────────────────────────────────────

function snap(
  prices: Record<string, { open?: number | null; close?: number | null }>,
): MarketSnapshot {
  const tickers: Record<string, TickerSnapshot> = {};
  for (const [t, v] of Object.entries(prices)) {
    tickers[t] = {
      ticker: t,
      open: v.open ?? null,
      close: v.close ?? null,
      prevClose: null,
      pctChange1d: null,
      pctChange5d: null,
      sma20: null,
      sma50: null,
      pctFrom20dHigh: null,
    };
  }
  return { tradingDay: "2026-06-18", tickers };
}

function vo(p: {
  ticker: string;
  side: Side;
  finalNotional: number;
  finalShares: number;
  fillPrice: number;
  status?: ValidatedOrder["status"];
  closePosition?: boolean;
}): ValidatedOrder {
  return {
    ticker: p.ticker,
    side: p.side,
    requestedNotional: p.finalNotional,
    finalNotional: p.finalNotional,
    finalShares: p.finalShares,
    fillPrice: p.fillPrice,
    status: p.status ?? "accepted",
    reasonCode: null,
    note: "",
    closePosition: p.closePosition ?? false,
  };
}

function report(orders: ValidatedOrder[]): ExecutionReport {
  return {
    orders,
    acceptedCount: orders.filter((o) => o.status === "accepted").length,
    clippedCount: orders.filter((o) => o.status === "clipped").length,
    rejectedCount: orders.filter((o) => o.status === "rejected").length,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("buy updates cash, shares and avg cost; NAV conserved at fill price", () => {
  const start: PortfolioState = { cash: 1000, positions: [] };
  const { portfolio } = applyExecution(
    start,
    report([vo({ ticker: "NVDA", side: "buy", finalNotional: 200, finalShares: 4, fillPrice: 50 })]),
  );
  assert.equal(portfolio.cash, 800);
  assert.equal(portfolio.positions[0].shares, 4);
  assert.equal(portfolio.positions[0].avgCost, 50);
  const nav = computeNav(portfolio, snap({ NVDA: { close: 50 } }));
  assert.equal(nav.nav, 1000); // cash 800 + 4 × 50
});

test("average cost blends across two buys", () => {
  let pf: PortfolioState = { cash: 1000, positions: [] };
  pf = applyExecution(pf, report([vo({ ticker: "NVDA", side: "buy", finalNotional: 100, finalShares: 2, fillPrice: 50 })])).portfolio;
  pf = applyExecution(pf, report([vo({ ticker: "NVDA", side: "buy", finalNotional: 140, finalShares: 2, fillPrice: 70 })])).portfolio;
  assert.equal(pf.positions[0].shares, 4);
  assert.equal(pf.positions[0].avgCost, 60); // (2×50 + 2×70) / 4
  assert.equal(pf.cash, 760);
  assert.equal(computeNav(pf, snap({ NVDA: { close: 70 } })).nav, 1040);
});

test("sell realizes P&L against avg cost and leaves avg cost unchanged", () => {
  const positions: Position[] = [{ ticker: "NVDA", shares: 4, avgCost: 50, realizedPnl: 0 }];
  const { portfolio, fills } = applyExecution(
    { cash: 800, positions },
    report([vo({ ticker: "NVDA", side: "sell", finalNotional: 120, finalShares: 2, fillPrice: 60 })]),
  );
  assert.equal(portfolio.positions[0].shares, 2);
  assert.equal(portfolio.positions[0].avgCost, 50); // unchanged on sells
  assert.equal(portfolio.positions[0].realizedPnl, 20); // 2 × (60 − 50)
  assert.equal(portfolio.cash, 920);
  assert.equal(fills[0].realizedPnl, 20);
});

test("closePosition fill clears the holding to exactly zero", () => {
  const positions: Position[] = [{ ticker: "NVDA", shares: 3.5, avgCost: 50, realizedPnl: 0 }];
  const { portfolio } = applyExecution(
    { cash: 0, positions },
    report([vo({ ticker: "NVDA", side: "sell", finalNotional: 175, finalShares: 3.5, fillPrice: 50, closePosition: true })]),
  );
  assert.equal(portfolio.positions[0].shares, 0);
  assert.equal(portfolio.cash, 175);
});

test("rejected orders are ignored by the ledger", () => {
  const start: PortfolioState = { cash: 1000, positions: [] };
  const { portfolio, fills } = applyExecution(
    start,
    report([vo({ ticker: "NVDA", side: "buy", finalNotional: 0, finalShares: 0, fillPrice: 50, status: "rejected" })]),
  );
  assert.equal(portfolio.cash, 1000);
  assert.equal(portfolio.positions.length, 0);
  assert.equal(fills.length, 0);
});

test("end-to-end referee → ledger: NAV reconciles to the penny", () => {
  const start: PortfolioState = { cash: 1000, positions: [] };
  const market = snap({ NVDA: { open: 50, close: 50 }, AMD: { open: 10, close: 10 } });
  const rep = validateOrders(
    {
      orders: [
        { ticker: "NVDA", side: "buy", notionalUsd: 300, closePosition: false, rationale: "t" }, // clips to 200
        { ticker: "AMD", side: "buy", notionalUsd: 100, closePosition: false, rationale: "t" },
      ],
    },
    start,
    market,
    {
      maxPositionPctOfNav: 0.2,
      minCashReservePct: 0.05,
      maxOrdersPerDay: 10,
      minOrderUsd: 1,
      allowShorting: false,
      allowLeverage: false,
      allowOptions: false,
      universe: ["NVDA", "AMD"],
    },
  );
  const { portfolio } = applyExecution(start, rep);
  const view = buildPortfolioView(portfolio, market);

  // The reconciliation invariant: reported NAV == cash + Σ position market value.
  const summed = view.positions.reduce((s, p) => s + p.marketValue, 0);
  assert.equal(view.nav, Math.round((view.cash + summed) * 100) / 100);
  assert.equal(view.nav, 1000); // $200 NVDA + $100 AMD + $700 cash
  assert.equal(view.cash, 700);
});

test("holding (empty report) leaves the portfolio unchanged", () => {
  const positions: Position[] = [{ ticker: "NVDA", shares: 4, avgCost: 50, realizedPnl: 0 }];
  const start: PortfolioState = { cash: 800, positions };
  const { portfolio, fills } = applyExecution(start, report([]));
  assert.equal(fills.length, 0);
  assert.deepEqual(portfolio, start);
});
