"use client";

// Tabbed chart card for a participant: a "Performance" tab (NAV line over time)
// and a "Holdings" tab (portfolio allocation as a stacked bar chart over time).
// Tab headers double as metric tiles, GF-light styling.

import { useState } from "react";

import { BrushLineChart } from "@/components/BrushLineChart";
import { StackedBarChart } from "@/components/StackedBarChart";
import { fmtUsd } from "@/lib/format";

type Datum = Record<string, string | number>;

export function ParticipantCharts({
  label,
  lineColor,
  navData,
  navValue,
  holdingsData,
  holdingsCategories,
  holdingsColors,
  holdingsValue,
}: {
  label: string;
  lineColor: string;
  navData: Datum[];
  navValue: string;
  holdingsData: Datum[];
  holdingsCategories: string[];
  holdingsColors: string[];
  holdingsValue: string;
}) {
  const [idx, setIdx] = useState(0);
  const tabs = [
    { name: "Performance", value: navValue },
    { name: "Holdings", value: holdingsValue },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex border-b border-border">
        {tabs.map((t, i) => {
          const active = i === idx;
          return (
            <button
              key={t.name}
              onClick={() => setIdx(i)}
              className={`relative flex-1 border-r border-border px-5 py-3 text-left transition-colors last:border-r-0 ${
                active ? "bg-white" : "bg-surface-2 hover:bg-surface-3"
              }`}
            >
              <span className={`block text-xs ${active ? "text-fg-3" : "text-fg-muted"}`}>{t.name}</span>
              <span className={`mt-0.5 block text-xl font-medium tnum ${active ? "text-fg" : "text-fg-3"}`}>
                {t.value}
              </span>
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        {idx === 0 ? (
          <BrushLineChart
            data={navData}
            index="date"
            category={label}
            color={lineColor}
            valueFormatter={fmtUsd}
            height={340}
          />
        ) : (
          <StackedBarChart
            className="h-72 w-full"
            data={holdingsData}
            index="date"
            categories={holdingsCategories}
            colors={holdingsColors}
            valueFormatter={fmtUsd}
          />
        )}
      </div>
    </section>
  );
}
