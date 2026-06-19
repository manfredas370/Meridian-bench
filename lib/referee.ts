// Deterministic order referee — pure TypeScript, no LLM, fully unit-testable.
//
// It is the sole authority on what actually executes. Orders are processed
// sequentially against a running cash/position state (so an earlier order
// consumes cash for later ones). Structurally invalid orders are REJECTED;
// orders that merely overshoot a constraint are CLIPPED to the allowed amount
// (broker-like) rather than thrown away. Every outcome carries a reason code.
//
// Long-only / no-leverage / no-options are enforced mechanically:
//   • shorting    → you cannot sell shares you do not hold (SELL_NO_POSITION)
//   • leverage    → you cannot spend past cash minus the reserve
//   • options     → not representable in the order schema
// Position caps and the cash reserve are measured against a START-OF-DAY NAV
// that is fixed for the whole batch, so order ordering cannot game the caps.

import type { DecisionOutput } from "@/lib/decision-schema";
import { isApproxZero, round2, round8 } from "@/lib/money";
import { fillPriceOf, valuationPriceOf } from "@/lib/pricing";
import type {
  ExecutionReport,
  MarketSnapshot,
  PortfolioState,
  Rules,
  ValidatedOrder,
} from "@/lib/types";

export function validateOrders(
  decision: Pick<DecisionOutput, "orders">,
  portfolio: PortfolioState,
  snapshot: MarketSnapshot,
  rules: Rules,
): ExecutionReport {
  const universe = new Set(rules.universe);

  // Running state, mutated as accepted/clipped orders execute.
  let cash = round2(portfolio.cash);
  const shares = new Map<string, number>();
  for (const p of portfolio.positions) shares.set(p.ticker, p.shares);

  // Start-of-day NAV, fixed for the whole batch.
  let startNav = cash;
  for (const p of portfolio.positions) {
    startNav += p.shares * valuationPriceOf(snapshot.tickers[p.ticker], p.avgCost);
  }
  startNav = round2(startNav);
  const reserveFloor = round2(startNav * rules.minCashReservePct);
  const posCap = round2(startNav * rules.maxPositionPctOfNav);

  const out: ValidatedOrder[] = [];

  decision.orders.forEach((order, idx) => {
    const base: ValidatedOrder = {
      ticker: order.ticker,
      side: order.side,
      requestedNotional: round2(order.notionalUsd),
      finalNotional: 0,
      finalShares: 0,
      fillPrice: null,
      status: "rejected",
      reasonCode: null,
      note: "",
      closePosition: order.closePosition,
    };
    const reject = (reasonCode: ValidatedOrder["reasonCode"], note: string) =>
      out.push({ ...base, status: "rejected", reasonCode, note });

    if (idx >= rules.maxOrdersPerDay) {
      return reject("MAX_ORDERS_EXCEEDED", `Exceeds max ${rules.maxOrdersPerDay} orders/day.`);
    }
    if (!universe.has(order.ticker)) {
      return reject("UNKNOWN_TICKER", `${order.ticker} is not in the tradeable universe.`);
    }
    const fillPrice = fillPriceOf(snapshot.tickers[order.ticker]);
    if (fillPrice == null || fillPrice <= 0) {
      return reject("NO_PRICE", `No usable price for ${order.ticker} today.`);
    }
    base.fillPrice = round2(fillPrice);
    if (!(order.notionalUsd > 0)) {
      return reject("NON_POSITIVE_QTY", "Order notional must be positive.");
    }

    const held = shares.get(order.ticker) ?? 0;

    // ── SELL ────────────────────────────────────────────────────────────────
    if (order.side === "sell") {
      if (held <= 0 || isApproxZero(held)) {
        return reject("SELL_NO_POSITION", `No ${order.ticker} held to sell (shorting disallowed).`);
      }

      let sellShares: number;
      let status: ValidatedOrder["status"] = "accepted";
      let reasonCode: ValidatedOrder["reasonCode"] = null;
      let note = "";

      if (order.closePosition) {
        sellShares = held;
        note = "Closed full position.";
      } else {
        if (order.notionalUsd < rules.minOrderUsd) {
          return reject("BELOW_MIN_ORDER", `Below minimum order size (${rules.minOrderUsd}).`);
        }
        const want = order.notionalUsd / fillPrice;
        if (want > held && !isApproxZero(want - held)) {
          sellShares = held;
          status = "clipped";
          reasonCode = "SELL_CLIPPED_TO_HOLDINGS";
          note = "Sell exceeded holdings; clipped to held shares.";
        } else {
          sellShares = Math.min(want, held);
        }
      }

      sellShares = round8(sellShares);
      const proceeds = round2(sellShares * fillPrice);
      cash = round2(cash + proceeds);
      shares.set(order.ticker, round8(held - sellShares));
      out.push({ ...base, status, reasonCode, note, finalNotional: proceeds, finalShares: sellShares });
      return;
    }

    // ── BUY ───────────────────────────────────────────────────────────────────
    if (order.notionalUsd < rules.minOrderUsd) {
      return reject("BELOW_MIN_ORDER", `Below minimum order size (${rules.minOrderUsd}).`);
    }
    const availableCash = round2(cash - reserveFloor);
    if (availableCash <= 0) {
      return reject("INSUFFICIENT_CASH", `No cash available above the ${rules.minCashReservePct * 100}% reserve.`);
    }
    const currentPosValue = round2(held * fillPrice);
    const capRoom = round2(posCap - currentPosValue);
    if (capRoom <= 0) {
      return reject("POSITION_CAP_CLIPPED", `${order.ticker} already at the ${rules.maxPositionPctOfNav * 100}% position cap.`);
    }

    let finalNotional = Math.min(order.notionalUsd, availableCash, capRoom);
    let status: ValidatedOrder["status"] = "accepted";
    let reasonCode: ValidatedOrder["reasonCode"] = null;
    let note = "";
    if (finalNotional < order.notionalUsd && !isApproxZero(order.notionalUsd - finalNotional)) {
      status = "clipped";
      if (capRoom <= availableCash && finalNotional === capRoom) {
        reasonCode = "POSITION_CAP_CLIPPED";
        note = `Clipped to the ${rules.maxPositionPctOfNav * 100}% position cap.`;
      } else {
        reasonCode = "INSUFFICIENT_CASH";
        note = `Clipped to cash available above the ${rules.minCashReservePct * 100}% reserve.`;
      }
    }

    finalNotional = round2(finalNotional);
    if (finalNotional < rules.minOrderUsd) {
      return reject("BELOW_MIN_ORDER", "Clipped amount fell below the minimum order size.");
    }
    const buyShares = round8(finalNotional / fillPrice);
    cash = round2(cash - finalNotional);
    shares.set(order.ticker, round8(held + buyShares));
    out.push({ ...base, status, reasonCode, note, finalNotional, finalShares: buyShares });
  });

  return {
    orders: out,
    acceptedCount: out.filter((o) => o.status === "accepted").length,
    clippedCount: out.filter((o) => o.status === "clipped").length,
    rejectedCount: out.filter((o) => o.status === "rejected").length,
  };
}
