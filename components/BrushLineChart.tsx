"use client";

// visx two-chart brush: a main line chart on top, and a short overview chart
// below with a draggable/resizable selection window. Dragging the brush filters
// the top chart's date range (zoom). Modeled on the official @visx/brush demo,
// adapted to a single NAV line on the Google-Finance-light theme (no gradients).

import { AxisBottom, AxisLeft } from "@visx/axis";
import { Brush } from "@visx/brush";
import { curveLinear } from "@visx/curve";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear, scaleTime } from "@visx/scale";
import { Bar, Line, LinePath } from "@visx/shape";
import { useMemo, useState } from "react";

/** Brush selection bounds (avoids a deep type import from @visx/brush). */
type BrushBounds = { x0: number; x1: number; y0: number; y1: number };

interface Point {
  date: Date;
  value: number;
}

const MARGIN = { top: 16, right: 20, bottom: 28, left: 60 };
const BRUSH_MARGIN = { top: 8, right: 20, bottom: 16, left: 60 };
const CHART_SEPARATION = 20;
const AXIS_COLOR = "var(--border-strong)";

const getDate = (p: Point) => p.date;
const getVal = (p: Point) => p.value;

function pad(min: number, max: number): [number, number] {
  const p = (max - min) * 0.08 || Math.max(1, max * 0.02);
  return [min - p, max + p];
}

interface BrushLineChartProps {
  data: Record<string, string | number>[];
  index: string;
  category: string;
  color: string;
  valueFormatter?: (n: number) => string;
  height?: number;
}

export function BrushLineChart({
  data,
  index,
  category,
  color,
  valueFormatter = (n) => String(n),
  height = 340,
}: BrushLineChartProps) {
  const all = useMemo<Point[]>(
    () =>
      data
        .map((r) => ({ date: new Date(String(r[index])), value: Number(r[category]) }))
        .filter((p) => !Number.isNaN(p.date.getTime()) && Number.isFinite(p.value))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [data, index, category],
  );

  return (
    <div style={{ width: "100%", height }}>
      <ParentSize>
        {({ width }) =>
          width > 0 && all.length > 0 ? (
            <Inner width={width} height={height} all={all} color={color} valueFormatter={valueFormatter} />
          ) : null
        }
      </ParentSize>
    </div>
  );
}

function Inner({
  width,
  height,
  all,
  color,
  valueFormatter,
}: {
  width: number;
  height: number;
  all: Point[];
  color: string;
  valueFormatter: (n: number) => string;
}) {
  const [filtered, setFiltered] = useState<Point[]>(all);
  const [hover, setHover] = useState<Point | null>(null);

  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const topBottomMargin = CHART_SEPARATION + 10;
  const topHeight = Math.max(0.78 * innerHeight - topBottomMargin, 0);
  const bottomHeight = Math.max(innerHeight - topHeight - CHART_SEPARATION, 0);

  const xMax = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const yMax = topHeight;
  const xBrushMax = Math.max(width - BRUSH_MARGIN.left - BRUSH_MARGIN.right, 0);
  const yBrushMax = Math.max(bottomHeight - BRUSH_MARGIN.top - BRUSH_MARGIN.bottom, 0);

  const view = filtered.length >= 2 ? filtered : all;

  const topDateScale = useMemo(
    () => scaleTime({ range: [0, xMax], domain: [view[0].date, view[view.length - 1].date] }),
    [xMax, view],
  );
  const topValueScale = useMemo(() => {
    const vals = view.map(getVal);
    return scaleLinear({ range: [yMax, 0], domain: pad(Math.min(...vals), Math.max(...vals)), nice: true });
  }, [yMax, view]);

  const brushDateScale = useMemo(
    () => scaleTime({ range: [0, xBrushMax], domain: [all[0].date, all[all.length - 1].date] }),
    [xBrushMax, all],
  );
  const brushValueScale = useMemo(() => {
    const vals = all.map(getVal);
    return scaleLinear({ range: [yBrushMax, 0], domain: pad(Math.min(...vals), Math.max(...vals)) });
  }, [yBrushMax, all]);

  const initialBrushPosition = useMemo(
    () => ({ start: { x: brushDateScale(all[0].date) }, end: { x: brushDateScale(all[all.length - 1].date) } }),
    [brushDateScale, all],
  );

  function onBrushChange(domain: BrushBounds | null) {
    if (!domain) return;
    const { x0, x1 } = domain;
    const next = all.filter((p) => {
      const t = p.date.getTime();
      return t >= x0 && t <= x1;
    });
    setFiltered(next);
  }

  const bottomTop = MARGIN.top + topHeight + topBottomMargin;
  const tickLabel = (fill: string) =>
    ({ fill, fontSize: 11, fontFamily: "inherit" }) as const;

  // Nearest point under the cursor (top chart only), for the hover tooltip.
  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const x = e.clientX - rect.left - MARGIN.left;
    const t = topDateScale.invert(x).getTime();
    let best = view[0];
    for (const p of view) if (Math.abs(p.date.getTime() - t) < Math.abs(best.date.getTime() - t)) best = p;
    setHover(best);
  }

  const tipLeft = hover ? MARGIN.left + topDateScale(hover.date) : 0;
  const tipTop = hover ? MARGIN.top + topValueScale(hover.value) : 0;

  return (
    <div style={{ position: "relative", width, height }}>
      <svg width={width} height={height}>
        {/* Main chart */}
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows scale={topValueScale} width={xMax} numTicks={4} stroke="var(--border)" />
          <LinePath<Point>
            data={view}
            x={(d) => topDateScale(getDate(d)) ?? 0}
            y={(d) => topValueScale(getVal(d)) ?? 0}
            stroke={color}
            strokeWidth={2}
            curve={curveLinear}
          />
          <AxisLeft
            scale={topValueScale}
            numTicks={4}
            tickFormat={(v) => valueFormatter(Number(v))}
            hideAxisLine
            hideTicks
            tickLabelProps={() => ({ ...tickLabel("var(--fg-3)"), textAnchor: "end", dx: -4, dy: 3 })}
          />
          <AxisBottom
            top={yMax}
            scale={topDateScale}
            numTicks={5}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickLabelProps={() => ({ ...tickLabel("var(--fg-3)"), textAnchor: "middle", dy: 2 })}
          />
          {hover && (
            <>
              <Line
                from={{ x: topDateScale(hover.date), y: 0 }}
                to={{ x: topDateScale(hover.date), y: yMax }}
                stroke="var(--border-strong)"
                strokeWidth={1}
                pointerEvents="none"
              />
              <circle
                cx={topDateScale(hover.date)}
                cy={topValueScale(hover.value)}
                r={3.5}
                fill={color}
                pointerEvents="none"
              />
            </>
          )}
          <Bar
            width={xMax}
            height={yMax}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </Group>

        {/* Overview + brush */}
        <Group left={BRUSH_MARGIN.left} top={bottomTop}>
          <LinePath<Point>
            data={all}
            x={(d) => brushDateScale(getDate(d)) ?? 0}
            y={(d) => brushValueScale(getVal(d)) ?? 0}
            stroke={color}
            strokeWidth={1}
            strokeOpacity={0.55}
            curve={curveLinear}
          />
          <Brush
            xScale={brushDateScale}
            yScale={brushValueScale}
            width={xBrushMax}
            height={yBrushMax}
            margin={BRUSH_MARGIN}
            handleSize={8}
            resizeTriggerAreas={["left", "right"]}
            brushDirection="horizontal"
            initialBrushPosition={initialBrushPosition}
            onChange={onBrushChange}
            onClick={() => setFiltered(all)}
            selectedBoxStyle={{ fill: "var(--accent)", fillOpacity: 0.12, stroke: "var(--accent)", strokeOpacity: 0.5 }}
            useWindowMoveEvents
          />
        </Group>
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-lg border border-border bg-white px-2.5 py-1.5 shadow-sm"
          style={{ left: tipLeft, top: tipTop }}
        >
          <div className="text-[11px] text-fg-3">
            {hover.date.toISOString().slice(0, 10)}
          </div>
          <div className="tnum text-xs font-medium text-fg">{valueFormatter(hover.value)}</div>
        </div>
      )}
    </div>
  );
}
