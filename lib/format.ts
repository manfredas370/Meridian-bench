// Display formatting helpers for the UI.

export const fmtUsd = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtPct = (frac: number, dp = 1): string => `${(frac * 100).toFixed(dp)}%`;

export const fmtPctSigned = (frac: number, dp = 1): string =>
  `${frac >= 0 ? "+" : ""}${(frac * 100).toFixed(dp)}%`;

/** Tailwind text color for a signed value. */
export const signColor = (n: number): string =>
  n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-500";
