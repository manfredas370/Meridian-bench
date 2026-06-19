// Minimal US trading-day helper. Rolls weekends back to Friday. Market
// holidays are NOT modeled in the alpha — on a holiday the provider returns no
// new bar and the snapshot reuses the latest available prices. (A real
// calendar can drop in here later.)

export function latestTradingDayISO(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  else if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
