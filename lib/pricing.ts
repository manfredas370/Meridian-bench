// Pure price-resolution helpers shared by the referee, ledger and engine.
//
// Fill convention (alpha): orders execute at day-T open; NAV is marked at
// day-T close. Both fall back gracefully when a field is missing/halted.

import type { TickerSnapshot } from "@/lib/types";

/** Price at which an order fills. Prefer the open; fall back to the close. */
export function fillPriceOf(t: TickerSnapshot | undefined): number | null {
  if (!t) return null;
  return t.open ?? t.close ?? null;
}

/** Price used to mark NAV / the equity curve. Prefer the close. */
export function markPriceOf(t: TickerSnapshot | undefined): number | null {
  if (!t) return null;
  return t.close ?? t.open ?? t.prevClose ?? null;
}

/**
 * Price used to value a held position for the referee's position-cap math.
 * Uses the same reference as fills (the transaction price) so the batch is
 * internally consistent; falls back to avgCost only if today has no price.
 */
export function valuationPriceOf(
  t: TickerSnapshot | undefined,
  avgCost: number,
): number {
  return fillPriceOf(t) ?? t?.prevClose ?? avgCost;
}
