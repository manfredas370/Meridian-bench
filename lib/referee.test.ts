import assert from "node:assert/strict";
import { test } from "node:test";

import { validateOrders } from "@/lib/referee";
import type {
  MarketSnapshot,
  PortfolioState,
  Position,
  Rules,
  Side,
  TickerSnapshot,
} from "@/lib/types";

// ── Test helpers ──────────────────────────────────────────────────────────

function snap(
  prices: Record<string, { open?: number | null; close?: number | null; prevClose?: number | null }>,
): MarketSnapshot {
  const tickers: Record<string, TickerSnapshot> = {};
  for (const [t, v] of Object.entries(prices)) {
    tickers[t] = {
      ticker: t,
      open: v.open ?? null,
      close: v.close ?? null,
      prevClose: v.prevClose ?? null,
      pctChange1d: null,
      pctChange5d: null,
      sma20: null,
      sma50: null,
      pctFrom20dHigh: null,
    };
  }
  return { tradingDay: "2026-06-18", tickers };
}

const BASE_RULES: Rules = {
  maxPositionPctOfNav: 0.2,
  minCashReservePct: 0.05,
  maxOrdersPerDay: 10,
  minOrderUsd: 1,
  allowShorting: false,
  allowLeverage: false,
  allowOptions: false,
  universe: ["NVDA", "AMD", "SPY"],
};

function rules(overrides: Partial<Rules> = {}): Rules {
  return { ...BASE_RULES, ...overrides };
}

function port(cash: number, positions: Position[] = []): PortfolioState {
  return { cash, positions };
}

function ord(p: {
  ticker: string;
  side: Side;
  notionalUsd: number;
  closePosition?: boolean;
}) {
  return {
    ticker: p.ticker,
    side: p.side,
    notionalUsd: p.notionalUsd,
    closePosition: p.closePosition ?? false,
    rationale: "test",
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("buy within limits is accepted", () => {
  const r = validateOrders(
    { orders: [ord({ ticker: "NVDA", side: "buy", notionalUsd: 100 })] },
    port(1000),
    snap({ NVDA: { open: 50, close: 50 } }),
    rules(),
  );
  assert.equal(r.acceptedCount, 1);
  assert.equal(r.orders[0].status, "accepted");
  assert.equal(r.orders[0].finalNotional, 100);
  assert.equal(r.orders[0].finalShares, 2);
});

test("buy is clipped to the 20% position cap", () => {
  const r = validateOrders(
    { orders: [ord({ ticker: "NVDA", side: "buy", notionalUsd: 500 })] },
    port(1000),
    snap({ NVDA: { open: 50, close: 50 } }),
    rules(),
  );
  assert.equal(r.orders[0].status, "clipped");
  assert.equal(r.orders[0].reasonCode, "POSITION_CAP_CLIPPED");
  assert.equal(r.orders[0].finalNotional, 200); // 20% of $1000
  assert.equal(r.orders[0].finalShares, 4);
});

test("buy is clipped to available cash when the cap is not binding", () => {
  const r = validateOrders(
    { orders: [ord({ ticker: "NVDA", side: "buy", notionalUsd: 50 })] },
    port(30),
    snap({ NVDA: { open: 10, close: 10 } }),
    rules({ maxPositionPctOfNav: 1 }), // cap = full NAV, so cash binds
  );
  assert.equal(r.orders[0].status, "clipped");
  assert.equal(r.orders[0].reasonCode, "INSUFFICIENT_CASH");
  assert.equal(r.orders[0].finalNotional, 28.5); // $30 - 5% reserve
});

test("sell exceeding holdings is clipped to held shares", () => {
  const positions: Position[] = [{ ticker: "NVDA", shares: 2, avgCost: 40, realizedPnl: 0 }];
  const r = validateOrders(
    { orders: [ord({ ticker: "NVDA", side: "sell", notionalUsd: 1000 })] },
    port(0, positions),
    snap({ NVDA: { open: 50, close: 50 } }),
    rules(),
  );
  assert.equal(r.orders[0].status, "clipped");
  assert.equal(r.orders[0].reasonCode, "SELL_CLIPPED_TO_HOLDINGS");
  assert.equal(r.orders[0].finalShares, 2);
  assert.equal(r.orders[0].finalNotional, 100);
});

test("sell with no position is rejected (no shorting)", () => {
  const r = validateOrders(
    { orders: [ord({ ticker: "NVDA", side: "sell", notionalUsd: 100 })] },
    port(1000),
    snap({ NVDA: { open: 50, close: 50 } }),
    rules(),
  );
  assert.equal(r.orders[0].status, "rejected");
  assert.equal(r.orders[0].reasonCode, "SELL_NO_POSITION");
});

test("closePosition sells the entire holding regardless of notional", () => {
  const positions: Position[] = [{ ticker: "NVDA", shares: 3.5, avgCost: 50, realizedPnl: 0 }];
  const r = validateOrders(
    { orders: [ord({ ticker: "NVDA", side: "sell", notionalUsd: 1, closePosition: true })] },
    port(0, positions),
    snap({ NVDA: { open: 50, close: 50 } }),
    rules(),
  );
  assert.equal(r.orders[0].status, "accepted");
  assert.equal(r.orders[0].finalShares, 3.5);
  assert.equal(r.orders[0].finalNotional, 175);
});

test("unknown ticker is rejected", () => {
  const r = validateOrders(
    { orders: [ord({ ticker: "TSLA", side: "buy", notionalUsd: 100 })] },
    port(1000),
    snap({ NVDA: { open: 50, close: 50 } }),
    rules(),
  );
  assert.equal(r.orders[0].status, "rejected");
  assert.equal(r.orders[0].reasonCode, "UNKNOWN_TICKER");
});

test("missing price is rejected", () => {
  const r = validateOrders(
    { orders: [ord({ ticker: "NVDA", side: "buy", notionalUsd: 100 })] },
    port(1000),
    snap({ NVDA: { open: null, close: null } }),
    rules(),
  );
  assert.equal(r.orders[0].status, "rejected");
  assert.equal(r.orders[0].reasonCode, "NO_PRICE");
});

test("below-minimum order is rejected", () => {
  const r = validateOrders(
    { orders: [ord({ ticker: "NVDA", side: "buy", notionalUsd: 0.5 })] },
    port(1000),
    snap({ NVDA: { open: 50, close: 50 } }),
    rules(),
  );
  assert.equal(r.orders[0].status, "rejected");
  assert.equal(r.orders[0].reasonCode, "BELOW_MIN_ORDER");
});

test("orders beyond the daily cap are rejected", () => {
  const orders = Array.from({ length: 11 }, () =>
    ord({ ticker: "AMD", side: "buy", notionalUsd: 1 }),
  );
  const r = validateOrders(
    { orders },
    port(1000),
    snap({ AMD: { open: 10, close: 10 } }),
    rules(),
  );
  assert.equal(r.acceptedCount, 10);
  assert.equal(r.orders[10].status, "rejected");
  assert.equal(r.orders[10].reasonCode, "MAX_ORDERS_EXCEEDED");
});

test("empty orders produce an empty report (holding is valid)", () => {
  const r = validateOrders({ orders: [] }, port(1000), snap({}), rules());
  assert.equal(r.orders.length, 0);
  assert.equal(r.acceptedCount, 0);
  assert.equal(r.rejectedCount, 0);
});

test("running state: a second buy of the same name is clipped to the cap", () => {
  const r = validateOrders(
    {
      orders: [
        ord({ ticker: "NVDA", side: "buy", notionalUsd: 150 }),
        ord({ ticker: "NVDA", side: "buy", notionalUsd: 100 }),
      ],
    },
    port(1000),
    snap({ NVDA: { open: 50, close: 50 } }),
    rules(),
  );
  assert.equal(r.orders[0].status, "accepted");
  assert.equal(r.orders[0].finalNotional, 150);
  assert.equal(r.orders[1].status, "clipped");
  assert.equal(r.orders[1].reasonCode, "POSITION_CAP_CLIPPED");
  assert.equal(r.orders[1].finalNotional, 50); // cap $200 - $150 already held
});
