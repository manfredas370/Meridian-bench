// Money / share rounding helpers.
//
// All cash and notional values are rounded to cents (2dp); shares are rounded
// to 8dp (fractional shares are realistic and required at $1000 capital).
// Routing every mutation through these keeps float drift from accumulating so
// that `cash + Σ(shares × price)` reconciles to the reported NAV to the penny.

/** Round to cents (2 decimal places). Use for cash, notional, market value, NAV. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Round to 8 decimal places. Use for share quantities. */
export function round8(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e8) / 1e8;
}

/** Treat tiny residuals (fractional-share dust) as zero. */
export function isApproxZero(n: number, eps = 1e-6): boolean {
  return Math.abs(n) < eps;
}

/** Percentage change from `from` to `to`, or null if undefined. */
export function pctChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  return round8((to - from) / from);
}
