// Leaderboard + performance chart for one experiment. Server component.
// Google Finance light styling; the chart is a Tremor-style area chart.

import Link from "next/link";

import { PerformanceChart } from "@/components/PerformanceChart";
import { ProviderLogo } from "@/components/ProviderLogo";
import { ScenarioLauncher } from "@/components/ScenarioLauncher";
import { assignColors } from "@/lib/chart-colors";
import { fmtPct, fmtUsd } from "@/lib/format";
import { benchmarkReturn, buildLeaderboard, tradingDayCount } from "@/lib/metrics";
import { getStore } from "@/lib/store";

/** GF-style change: colored ▲/▼ + magnitude. */
function Delta({ value, dp = 1 }: { value: number; dp?: number }) {
  const up = value >= 0;
  return (
    <span className={`tnum ${up ? "text-gain" : "text-loss"}`}>
      <span className="text-[0.7em]">{up ? "▲" : "▼"}</span> {fmtPct(Math.abs(value), dp)}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-medium uppercase tracking-wider text-fg-3">{children}</div>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 px-5 py-3 first:pl-5">
      <Label>{label}</Label>
      <div className="mt-1 text-[17px] tnum text-fg">
        {value}
        {sub && <span className="ml-1 text-sm text-fg-3">{sub}</span>}
      </div>
    </div>
  );
}

/** The headline tile: who is winning the arena right now. */
function LeaderStat({ label, color, ret }: { label: string; color: string; ret: number }) {
  return (
    <div className="flex-[1.4] px-5 py-3 first:pl-5">
      <Label>Leader</Label>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-[15px] font-medium text-fg">{label}</span>
        <span className="text-[13px]">
          <Delta value={ret} />
        </span>
      </div>
    </div>
  );
}

export async function ExperimentView({
  experimentId,
  embedded = false,
}: {
  experimentId: string;
  /** Home tabs supply the header/launcher/switcher, so omit them here. */
  embedded?: boolean;
}) {
  const store = getStore();
  const experiment = await store.getExperiment(experimentId);
  if (!experiment) return <p className="text-sm text-fg-3">Experiment not found.</p>;

  const isScenario = experiment.kind === "scenario";
  const parent = experiment.parentExperimentId
    ? await store.getExperiment(experiment.parentExperimentId)
    : null;

  const [participants, navHistory, allExperiments] = await Promise.all([
    store.listParticipants(experimentId),
    store.listNavHistory(experimentId),
    store.listExperiments(),
  ]);
  // Sibling live runs (e.g. price-only vs. fundamentals) for a quick switcher.
  const siblings = allExperiments.filter(
    (e) => e.kind === "live" && e.status === "running" && e.id !== experimentId,
  );
  const rows = buildLeaderboard(participants, navHistory);
  const colors = assignColors(rows);
  const spy = benchmarkReturn(rows, "SPY");
  const days = tradingDayCount(rows);

  // Pivot nav history into per-day rows keyed by participant label, for the chart.
  const dayKeys = Array.from(new Set(rows.flatMap((r) => r.points.map((p) => p.day)))).sort();
  const categories = rows.map((r) => r.participant.label);
  // The passive index controls render as dashed baselines (the bar to beat).
  const benchmarkLabels = rows.filter((r) => r.participant.kind === "passive").map((r) => r.participant.label);
  // The full test window: prefer the configured experiment dates, else the
  // captured range.
  const periodStart = experiment.startDate ?? dayKeys[0] ?? null;
  const periodEnd = experiment.endDate ?? dayKeys.at(-1) ?? null;
  const chartData = dayKeys.map((day) => {
    const row: Record<string, string | number> = { date: day };
    for (const r of rows) {
      const pt = r.points.find((p) => p.day === day);
      if (pt) row[r.participant.label] = pt.nav;
    }
    return row;
  });

  return (
    <section className="space-y-5">
      {isScenario && experiment.scenario && (
        <div className="rounded-xl border border-border bg-accent-soft px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm font-medium text-fg">
            <span aria-hidden>⚡</span>
            Stress test · {experiment.scenario.presetLabel}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">{experiment.scenario.description}</p>
          <p className="mt-1.5 text-xs text-fg-3">
            Synthetic shock on a fork of{" "}
            {parent ? (
              <Link href={`/experiment/${parent.id}`} className="text-accent hover:underline">
                {parent.name}
              </Link>
            ) : (
              "the live run"
            )}{" "}
            as of {experiment.scenario.anchorDay}. Paper trading — the live run is unaffected.
          </p>
        </div>
      )}

      {embedded && periodStart && periodEnd && (
        <p className="text-sm text-fg-3">
          {periodStart} <span className="text-fg-muted">→</span> {periodEnd}
        </p>
      )}

      {!embedded && (
      <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-medium tracking-tight text-fg">
              {isScenario ? "Scenario standings" : "Standings"}
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                experiment.dataTier === "fundamentals" ? "bg-accent-soft text-accent" : "bg-surface-3 text-fg-3"
              }`}
              title={
                experiment.dataTier === "fundamentals"
                  ? "Models also see fundamentals, analyst ratings, and recent news"
                  : "Models see price + technicals only"
              }
            >
              {experiment.dataTier === "fundamentals" ? "Fundamentals + News" : "Price only"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-fg-3">
            {periodStart && periodEnd ? (
              <>
                {periodStart} <span className="text-fg-muted">→</span> {periodEnd}
              </>
            ) : (
              "Live-forward run"
            )}
          </p>
        </div>
        {!isScenario && <ScenarioLauncher sourceExperimentId={experimentId} />}
      </header>

      {siblings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
          <span>Compare:</span>
          {siblings.map((s) => (
            <Link
              key={s.id}
              href={`/experiment/${s.id}`}
              className="rounded-full border border-border px-2.5 py-1 font-medium text-fg-2 transition-colors hover:border-border-strong hover:text-accent"
            >
              {s.dataTier === "fundamentals" ? "Fundamentals + News" : "Price only"} run ↗
            </Link>
          ))}
        </div>
      )}
      </>
      )}

      <div className="flex flex-wrap divide-x divide-border rounded-xl border border-border-strong bg-white">
        {rows.length > 0 ? (
          <LeaderStat label={rows[0].participant.label} color={colors[0]} ret={rows[0].totalReturnPct} />
        ) : (
          <Stat label="Leader" value="—" />
        )}
        <Stat label="Trading days" value={String(days)} />
        <Stat label="Field" value={String(participants.length)} sub="models" />
        <Stat label="Capital" value={fmtUsd(experiment.startingCash)} />
      </div>

      <div className="rounded-xl border border-border-strong bg-white p-4 sm:p-5">
        {chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-fg-3">
            No NAV history yet — advance the simulation to plot performance.
          </div>
        ) : (
          <PerformanceChart
            data={chartData}
            categories={categories}
            colors={colors}
            showLegend={false}
            dashed={benchmarkLabels}
          />
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border-strong bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-[10px] uppercase tracking-wider text-fg-3">
              <th className="py-2.5 pl-5 pr-3 font-medium">Model</th>
              <th className="px-3 py-2.5 text-right font-medium">Return</th>
              <th className="px-3 py-2.5 text-right font-medium">NAV</th>
              <th className="px-3 py-2.5 text-right font-medium">Max DD</th>
              <th className="px-3 py-2.5 text-right font-medium">Cash</th>
              <th className="px-5 py-2.5 text-right font-medium">vs SPY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const isPassive = r.participant.kind === "passive";
              const isLeader = i === 0;
              const vsSpy = spy != null && !isPassive ? r.totalReturnPct - spy : null;
              return (
                <tr
                  key={r.participant.id}
                  className={isLeader ? "" : "transition-colors hover:bg-surface-2"}
                  // Leader row: a faint wash of the leader's own identity color (~8%).
                  style={isLeader ? { backgroundColor: `${colors[i]}14` } : undefined}
                >
                  {/* Identity color chip + provider logo + model name. */}
                  <td className="py-3 pl-5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-3.5 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: colors[i] }}
                        aria-hidden
                      />
                      {isPassive ? (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-surface-3 text-[8px] font-semibold text-fg-3">
                          {r.participant.benchmarkTicker ?? "IX"}
                        </span>
                      ) : (
                        <ProviderLogo modelId={r.participant.modelId} />
                      )}
                      <Link
                        href={`/participant/${r.participant.id}`}
                        className={`font-medium hover:text-accent hover:underline ${isPassive ? "text-fg-2" : "text-fg"}`}
                      >
                        {r.participant.label}
                      </Link>
                      {isPassive && (
                        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-fg-3">
                          index
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    <Delta value={r.totalReturnPct} />
                  </td>
                  <td className="px-3 py-3 text-right tnum text-fg">{fmtUsd(r.latestNav)}</td>
                  <td className="px-3 py-3 text-right tnum text-fg-3">{fmtPct(r.maxDrawdownPct)}</td>
                  <td className="px-3 py-3 text-right tnum text-fg-3">{fmtPct(r.cashPct)}</td>
                  <td className="px-5 py-3 text-right font-medium">
                    {vsSpy == null ? <span className="text-fg-muted">—</span> : <Delta value={vsSpy} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}
