// Equity chart, Google Finance style: clean white field, faint gridlines, a
// dotted baseline at the $1,000 start, GF-style multi-color lines with end
// dots, and a pill-chip legend. Static SVG, no client JS, no chart library.

import { fmtPct, fmtUsd } from "@/lib/format";
import type { LeaderRow } from "@/lib/metrics";

/** GF-style categorical palette for the models; grays for the index controls. */
const MODEL_PALETTE = ["#4285f4", "#f29900", "#a142f4", "#009688", "#e52592", "#5e35b1"];

export interface SeriesStyle {
  color: string;
}

export function buildSeriesStyles(rows: LeaderRow[]): Map<string, SeriesStyle> {
  const map = new Map<string, SeriesStyle>();
  let m = 0;
  for (const r of rows) {
    if (r.participant.kind === "passive") {
      map.set(r.participant.id, { color: r.participant.benchmarkTicker === "SPY" ? "#5f6368" : "#b0b4b8" });
    } else {
      map.set(r.participant.id, { color: MODEL_PALETTE[m % MODEL_PALETTE.length] });
      m++;
    }
  }
  return map;
}

export function EquityChart({ rows, startCash }: { rows: LeaderRow[]; startCash: number }) {
  const days = Array.from(new Set(rows.flatMap((r) => r.points.map((p) => p.day)))).sort();
  if (days.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong p-10 text-center text-sm text-fg-3">
        No NAV history yet — advance the simulation to plot equity curves.
      </div>
    );
  }

  const styles = buildSeriesStyles(rows);
  const W = 920, H = 320, padL = 64, padR = 56, padT = 16, padB = 28;
  const navs = rows.flatMap((r) => r.points.map((p) => p.nav)).concat([startCash]);
  const minNav = Math.min(...navs);
  const maxNav = Math.max(...navs);
  const span = maxNav - minNav || Math.max(1, startCash * 0.02);
  const yMin = minNav - span * 0.1;
  const yMax = maxNav + span * 0.1;
  const idx = new Map(days.map((d, i) => [d, i]));
  const xFor = (d: string) => padL + (days.length <= 1 ? 0 : (idx.get(d)! / (days.length - 1)) * (W - padL - padR));
  const yFor = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Equity curves">
        {/* gridlines + y labels */}
        {[yMax, startCash, yMin].map((v, i) => {
          const isBase = i === 1;
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={yFor(v)}
                x2={W - padR}
                y2={yFor(v)}
                stroke={isBase ? "var(--border-strong)" : "var(--border)"}
                strokeDasharray={isBase ? "2 4" : undefined}
              />
              <text x={padL - 10} y={yFor(v) + 4} textAnchor="end" className="fill-fg-3 tnum" fontSize="11">
                {fmtUsd(v)}
              </text>
            </g>
          );
        })}

        {/* series — index controls (gray) under the models */}
        {[...rows]
          .sort((a, b) => Number(b.participant.kind === "passive") - Number(a.participant.kind === "passive"))
          .map((r) => {
            if (r.points.length === 0) return null;
            const color = styles.get(r.participant.id)!.color;
            return (
              <polyline
                key={r.participant.id}
                points={r.points.map((p) => `${xFor(p.day).toFixed(1)},${yFor(p.nav).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

        {/* end dots */}
        {rows.map((r) => {
          if (r.points.length === 0) return null;
          const last = r.points.at(-1)!;
          return (
            <circle
              key={r.participant.id}
              cx={xFor(last.day)}
              cy={yFor(last.nav)}
              r={3}
              fill={styles.get(r.participant.id)!.color}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          );
        })}

        <text x={padL} y={H - 8} textAnchor="start" className="fill-fg-muted" fontSize="11">
          {days[0]}
        </text>
        <text x={W - padR} y={H - 8} textAnchor="end" className="fill-fg-muted" fontSize="11">
          {days.at(-1)}
        </text>
      </svg>

      {/* legend — GF-style chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {rows.map((r) => {
          const up = r.totalReturnPct >= 0;
          return (
            <span
              key={r.participant.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs"
            >
              <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: styles.get(r.participant.id)!.color }} />
              <span className="text-fg-2">{r.participant.label}</span>
              <span className={`tnum ${up ? "text-gain" : "text-loss"}`}>
                {up ? "▲" : "▼"} {fmtPct(Math.abs(r.totalReturnPct))}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
