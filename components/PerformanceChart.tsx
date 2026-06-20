"use client";

// Client wrapper for the home NAV chart. ExperimentView (a server component)
// passes only serializable props; the USD formatter is supplied here because
// functions can't cross the server→client boundary.

import { LineChart } from "@/components/LineChart";
import { fmtUsd } from "@/lib/format";

export function PerformanceChart({
  data,
  categories,
  colors,
}: {
  data: Record<string, string | number>[];
  categories: string[];
  colors: string[];
}) {
  return (
    <LineChart
      className="h-72 w-full"
      data={data}
      index="date"
      categories={categories}
      colors={colors}
      valueFormatter={fmtUsd}
    />
  );
}
