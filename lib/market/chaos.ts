// Synthetic-shock SnapshotProvider for "stress test" scenarios. Self-contained:
// given each ticker's real anchor close (read once from the parent run's last
// snapshot — no network), it fabricates a bar series that is flat up to the
// anchor day, then bends along the preset's daily return path. computeTicker
// Snapshot then derives the usual indicators, so the shock surfaces in the
// price table exactly as a real move would.
//
// Timing note: features are computed through the PRIOR close, so day 1 still
// shows pre-shock data (the model is "caught" and fills into the move at the
// open); from day 2 the crash is visible in 1d/5d % and the model can react.

import type { SnapshotProvider } from "@/lib/engine/tick";
import { computeTickerSnapshot, type DailyBar } from "@/lib/market/indicators";
import { round2 } from "@/lib/money";
import { shockReturnFor, type ScenarioPreset } from "@/lib/scenarios";

const CTX_BARS = 54; // flat history before the anchor so SMA20/50 are defined
const OPEN_FRACTION = 0.8; // share of the day's move already present at the open (gap)

/** Add `n` calendar days to an ISO date (YYYY-MM-DD). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Full bar series for one ticker: flat context at `anchorClose` through
 * `anchorDay`, then one shocked bar per scenario day following the preset.
 */
export function buildShockedBars(
  ticker: string,
  anchorClose: number,
  anchorDay: string,
  scenarioDays: string[],
  preset: ScenarioPreset,
): DailyBar[] {
  const bars: DailyBar[] = [];
  for (let i = CTX_BARS; i >= 1; i--) {
    bars.push({ date: addDays(anchorDay, -i), open: anchorClose, close: anchorClose });
  }
  bars.push({ date: anchorDay, open: anchorClose, close: anchorClose });

  let prevClose = anchorClose;
  scenarioDays.forEach((day, j) => {
    const r = preset.days[j] ? shockReturnFor(ticker, preset.days[j]) : 0;
    const close = round2(prevClose * (1 + r));
    const open = round2(prevClose * (1 + OPEN_FRACTION * r)); // gaps most of the move at the open
    bars.push({ date: day, open, close });
    prevClose = close;
  });
  return bars;
}

export interface ScenarioProviderOptions {
  anchorDay: string;
  anchorCloses: Record<string, number | null>;
  scenarioDays: string[];
  preset: ScenarioPreset;
}

/** A SnapshotProvider that returns the shocked snapshot for a scenario day. */
export function createScenarioSnapshotProvider(opts: ScenarioProviderOptions): SnapshotProvider {
  const { anchorDay, anchorCloses, scenarioDays, preset } = opts;
  return async (tickers, tradingDay) =>
    tickers.map((t) => {
      const anchor = anchorCloses[t];
      if (anchor == null) return computeTickerSnapshot(t, [], tradingDay); // no real price → null snapshot
      const bars = buildShockedBars(t, anchor, anchorDay, scenarioDays, preset);
      return computeTickerSnapshot(t, bars, tradingDay);
    });
}
