/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// Tremor-style area chart on Recharts: gradient-filled areas, clean light axes,
// a custom tooltip, and a chip legend. API mirrors Tremor's AreaChart
// (data / index / categories / colors / valueFormatter / className).

import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Datum = Record<string, string | number>;

interface AreaChartProps {
  data: Datum[];
  index: string;
  categories: string[];
  colors?: string[];
  valueFormatter?: (n: number) => string;
  className?: string;
  showLegend?: boolean;
}

const DEFAULT_COLORS = ["#4285f4", "#f29900", "#a142f4", "#009688", "#e52592", "#5e35b1", "#5f6368", "#b0b4b8"];

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  valueFormatter: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-sm">
      <div className="mb-1.5 text-xs text-fg-3">{label}</div>
      <div className="space-y-1">
        {rows.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: p.color }} />
              <span className="text-fg-2">{p.dataKey}</span>
            </span>
            <span className="tnum font-medium text-fg">{valueFormatter(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AreaChart({
  data,
  index,
  categories,
  colors = DEFAULT_COLORS,
  valueFormatter = (n) => String(n),
  className,
  showLegend = true,
}: AreaChartProps) {
  const values = data.flatMap((d) => categories.map((c) => d[c]).filter((v) => typeof v === "number")) as number[];
  const dMin = values.length ? Math.min(...values) : 0;
  const dMax = values.length ? Math.max(...values) : 1;
  const pad = (dMax - dMin) * 0.08 || Math.max(1, dMax * 0.02);
  const yMin = dMin - pad;
  const yMax = dMax + pad;

  return (
    <div>
      <div className={className}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsAreaChart data={data} margin={{ top: 8, right: 14, left: 4, bottom: 0 }}>
            <defs>
              {categories.map((c, i) => (
                <linearGradient key={c} id={`mb-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid horizontal vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey={index}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--fg-3)", fontSize: 11 }}
              minTickGap={28}
              padding={{ left: 6, right: 6 }}
            />
            <YAxis
              width={68}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--fg-3)", fontSize: 11 }}
              tickFormatter={(v) => valueFormatter(Number(v))}
              domain={[yMin, yMax]}
            />
            <Tooltip
              content={<ChartTooltip valueFormatter={valueFormatter} />}
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            />
            {categories.map((c, i) => (
              <Area
                key={c}
                type="monotone"
                dataKey={c}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                fill={`url(#mb-grad-${i})`}
                fillOpacity={1}
                baseValue={yMin}
                dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </RechartsAreaChart>
        </ResponsiveContainer>
      </div>

      {showLegend && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {categories.map((c, i) => (
            <span key={c} className="inline-flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="text-fg-2">{c}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
