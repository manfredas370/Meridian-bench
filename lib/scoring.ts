// Reasoning-quality scoring that goes beyond raw P&L.
//
// Calibration: does a model's stated confidence track its realized outcomes?
// We correlate each decision's confidence with that day's portfolio return
// (Pearson). Positive → confident calls tend to pay off (well-calibrated);
// negative → overconfident. Thin samples are noisy, so we require ≥ 4 points.

import type { DecisionRecord, NavRecord } from "@/lib/store/types";

export interface Calibration {
  value: number | null; // Pearson correlation in [-1, 1], or null if too few points
  label: string;
  n: number;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function confidenceCalibration(decisions: DecisionRecord[], navs: NavRecord[]): Calibration {
  const retByDay = new Map(navs.map((n) => [n.tradingDay, n.dailyReturn]));
  const pairs = decisions
    .filter((d) => d.confidence != null && !d.error)
    .map((d) => ({ c: d.confidence as number, r: retByDay.get(d.tradingDay) }))
    .filter((p): p is { c: number; r: number } => typeof p.r === "number");

  const n = pairs.length;
  if (n < 4) return { value: null, label: "Not enough data", n };

  const mc = avg(pairs.map((p) => p.c));
  const mr = avg(pairs.map((p) => p.r));
  let num = 0;
  let dc = 0;
  let dr = 0;
  for (const p of pairs) {
    const a = p.c - mc;
    const b = p.r - mr;
    num += a * b;
    dc += a * a;
    dr += b * b;
  }
  if (dc === 0 || dr === 0) return { value: null, label: "Flat confidence", n };

  const corr = num / Math.sqrt(dc * dr);
  const label = corr > 0.2 ? "Well-calibrated" : corr < -0.2 ? "Overconfident" : "Mixed";
  return { value: corr, label, n };
}
