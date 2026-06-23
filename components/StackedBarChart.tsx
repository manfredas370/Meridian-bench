/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// Tremor-style stacked bar chart on Recharts: clean light axes, a custom
// tooltip (per-series + total), and a chip legend. API mirrors our LineChart
// (data / index / categories / colors / valueFormatter / className).

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Datum = Record<string, string | number>;

interface StackedBarChartProps {
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
  const rows = payload.filter((p) => (p.value ?? 0) > 0);
  const total = rows.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-sm">
      <div className="mb-1.5 text-xs text-fg-3">{label}</div>
      <div className="space-y-1">
        {[...rows].reverse().map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: p.color }} />
              <span className="text-fg-2">{p.dataKey}</span>
            </span>
            <span className="tnum font-medium text-fg">{valueFormatter(p.value)}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-5 border-t border-border pt-1 text-xs">
          <span className="text-fg-3">Total</span>
          <span className="tnum font-medium text-fg">{valueFormatter(total)}</span>
        </div>
      </div>
    </div>
  );
}

export function StackedBarChart({
  data,
  index,
  categories,
  colors = DEFAULT_COLORS,
  valueFormatter = (n) => String(n),
  className,
  showLegend = true,
}: StackedBarChartProps) {
  return (
    <div>
      <div className={className}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={data} margin={{ top: 8, right: 14, left: 4, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid horizontal vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey={index}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--fg-3)", fontSize: 11 }}
              minTickGap={28}
            />
            <YAxis
              width={68}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--fg-3)", fontSize: 11 }}
              tickFormatter={(v) => valueFormatter(Number(v))}
            />
            <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={{ fill: "var(--surface-2)" }} />
            {categories.map((c, i) => (
              <Bar
                key={c}
                dataKey={c}
                stackId="a"
                fill={colors[i % colors.length]}
                isAnimationActive={false}
                maxBarSize={48}
              />
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>

      {showLegend && (
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
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
