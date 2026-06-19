// Multi-line equity chart, rendered as static SVG (no client JS, no chart lib).
// Passive controls are drawn dashed. The dashed gray baseline is starting cash.

import { fmtPctSigned, fmtUsd } from "@/lib/format";
import type { LeaderRow } from "@/lib/metrics";

const PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#84cc16", "#ec4899", "#0ea5e9", "#f43f5e",
];

export function colorFor(i: number): string {
  return PALETTE[i % PALETTE.length];
}

export function EquityChart({ rows, startCash }: { rows: LeaderRow[]; startCash: number }) {
  const days = Array.from(new Set(rows.flatMap((r) => r.points.map((p) => p.day)))).sort();
  if (days.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        No NAV history yet — advance the simulation to plot equity curves.
      </div>
    );
  }

  const W = 760, H = 300, padL = 60, padR = 18, padT = 16, padB = 30;
  const navs = rows.flatMap((r) => r.points.map((p) => p.nav)).concat([startCash]);
  const minNav = Math.min(...navs);
  const maxNav = Math.max(...navs);
  const span = maxNav - minNav || Math.max(1, startCash * 0.02);
  const yMin = minNav - span * 0.08;
  const yMax = maxNav + span * 0.08;
  const idx = new Map(days.map((d, i) => [d, i]));
  const xFor = (d: string) =>
    padL + (days.length <= 1 ? 0 : (idx.get(d)! / (days.length - 1)) * (W - padL - padR));
  const yFor = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Equity curves">
        {[yMax, startCash, yMin].map((v, i) => (
          <g key={i} className="text-zinc-400">
            <line
              x1={padL}
              y1={yFor(v)}
              x2={W - padR}
              y2={yFor(v)}
              stroke="currentColor"
              strokeOpacity={i === 1 ? 0.3 : 0.12}
              strokeDasharray={i === 1 ? "4 4" : undefined}
            />
            <text x={padL - 8} y={yFor(v) + 3} textAnchor="end" className="fill-zinc-500" fontSize="10">
              {fmtUsd(v)}
            </text>
          </g>
        ))}
        <text x={padL} y={H - 10} textAnchor="start" className="fill-zinc-500" fontSize="10">
          {days[0]}
        </text>
        <text x={W - padR} y={H - 10} textAnchor="end" className="fill-zinc-500" fontSize="10">
          {days.at(-1)}
        </text>
        {rows.map((r, i) => {
          if (r.points.length === 0) return null;
          const pts = r.points.map((p) => `${xFor(p.day).toFixed(1)},${yFor(p.nav).toFixed(1)}`).join(" ");
          const dashed = r.participant.kind === "passive";
          return (
            <polyline
              key={r.participant.id}
              points={pts}
              fill="none"
              stroke={colorFor(i)}
              strokeWidth={dashed ? 1.5 : 2.25}
              strokeDasharray={dashed ? "5 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r, i) => (
          <span key={r.participant.id} className="inline-flex items-center gap-1.5 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorFor(i) }} />
            <span className="text-zinc-700 dark:text-zinc-300">{r.participant.label}</span>
            <span className={r.totalReturnPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
              {fmtPctSigned(r.totalReturnPct)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
