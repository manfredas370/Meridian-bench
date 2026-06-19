// The structured-output contract every model trader must return.
//
// Pure Zod (no AI import) so the referee, tests and engine can share the types.
// All fields are required (no optionals) for maximum cross-provider reliability
// with structured generation. The universe-constrained variant additionally
// prevents the model from naming a ticker outside the tradeable set.

import { z } from "zod";

export const OrderSchema = z.object({
  ticker: z.string(),
  side: z.enum(["buy", "sell"]),
  /** Dollar amount to trade. Ledger converts to fractional shares at fill price. */
  notionalUsd: z.number().positive(),
  /** When true on a sell, exit 100% of the held shares (notionalUsd ignored). */
  closePosition: z.boolean(),
  rationale: z.string().min(1).max(280),
});

export const DecisionSchema = z.object({
  thesis: z.string().min(1).max(800),
  confidence: z.number().min(0).max(1),
  marketOutlook: z.enum(["bullish", "neutral", "bearish"]),
  /** Empty array = "hold today" — a first-class, non-penalized outcome. */
  orders: z.array(OrderSchema).max(50),
});

export type Order = z.infer<typeof OrderSchema>;
export type DecisionOutput = z.infer<typeof DecisionSchema>;

/**
 * Universe-constrained schema for the actual model call. Structurally prevents
 * off-universe tickers (the referee is still the final authority at runtime).
 */
export function makeDecisionSchema(universe: string[]) {
  const ticker =
    universe.length > 0
      ? z.enum(universe as [string, ...string[]])
      : z.string();

  return z.object({
    thesis: z.string().min(1).max(800),
    confidence: z.number().min(0).max(1),
    marketOutlook: z.enum(["bullish", "neutral", "bearish"]),
    orders: z
      .array(
        z.object({
          ticker,
          side: z.enum(["buy", "sell"]),
          notionalUsd: z.number().positive(),
          closePosition: z.boolean(),
          rationale: z.string().min(1).max(280),
        }),
      )
      .max(50),
  });
}
