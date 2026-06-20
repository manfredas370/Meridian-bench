// Stable series colors, shared by the chart and the leaderboard swatches.
// GF-style categorical palette for models; grays for the index controls.

import type { LeaderRow } from "@/lib/metrics";

export const MODEL_PALETTE = ["#4285f4", "#f29900", "#a142f4", "#009688", "#e52592", "#5e35b1"];

/** One hex per row, aligned to row order (leaderboard order). */
export function assignColors(rows: LeaderRow[]): string[] {
  let m = 0;
  return rows.map((r) =>
    r.participant.kind === "passive"
      ? r.participant.benchmarkTicker === "SPY"
        ? "#5f6368"
        : "#b0b4b8"
      : MODEL_PALETTE[m++ % MODEL_PALETTE.length],
  );
}
