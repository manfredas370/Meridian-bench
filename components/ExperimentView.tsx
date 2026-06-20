// Leaderboard + performance chart for one experiment. Server component.
// Google Finance light styling; the chart is a Tremor-style area chart.

import Link from "next/link";

import { PerformanceChart } from "@/components/PerformanceChart";
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 px-5 py-3.5 first:pl-5">
      <div className="text-xs text-fg-3">{label}</div>
      <div className="mt-0.5 text-lg tnum text-fg">
        {value}
        {sub && <span className="ml-1 text-sm text-fg-3">{sub}</span>}
      </div>
    </div>
  );
}

export async function ExperimentView({ experimentId }: { experimentId: string }) {
  const store = getStore();
  const experiment = await store.getExperiment(experimentId);
  if (!experiment) return <p className="text-sm text-fg-3">Experiment not found.</p>;

  const [participants, navHistory] = await Promise.all([
    store.listParticipants(experimentId),
    store.listNavHistory(experimentId),
  ]);
  const rows = buildLeaderboard(participants, navHistory);
  const colors = assignColors(rows);
  const spy = benchmarkReturn(rows, "SPY");
  const days = tradingDayCount(rows);

  // Pivot nav history into per-day rows keyed by participant label, for the chart.
  const dayKeys = Array.from(new Set(rows.flatMap((r) => r.points.map((p) => p.day)))).sort();
  const categories = rows.map((r) => r.participant.label);
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
      <header>
        <h1 className="text-[22px] font-medium tracking-tight text-fg">Standings</h1>
        <p className="mt-0.5 text-sm text-fg-3">
          {experiment.name}
          {dayKeys.length > 0 && (
            <span className="text-fg-muted">
              {" · "}
              {dayKeys[0]} → {dayKeys.at(-1)}
            </span>
          )}
        </p>
      </header>

      <div className="flex flex-wrap divide-x divide-border rounded-xl border border-border bg-white">
        <Stat label="Participants" value={String(participants.length)} />
        <Stat label="Trading days" value={String(days)} />
        <Stat label="Starting capital" value={fmtUsd(experiment.startingCash)} />
        <Stat label="Universe" value={String(experiment.universe.length)} sub="tickers" />
      </div>

      <div className="rounded-xl border border-border bg-white p-4 sm:p-5">
        {chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-fg-3">
            No NAV history yet — advance the simulation to plot performance.
          </div>
        ) : (
          <PerformanceChart data={chartData} categories={categories} colors={colors} />
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-3">
              <th className="py-2.5 pl-5 pr-2 font-normal">#</th>
              <th className="px-3 py-2.5 font-normal">Model</th>
              <th className="px-3 py-2.5 text-right font-normal">Total return</th>
              <th className="px-3 py-2.5 text-right font-normal">NAV</th>
              <th className="px-3 py-2.5 text-right font-normal">Max DD</th>
              <th className="px-3 py-2.5 text-right font-normal">Cash</th>
              <th className="px-5 py-2.5 text-right font-normal">vs SPY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const isPassive = r.participant.kind === "passive";
              const vsSpy = spy != null && !isPassive ? r.totalReturnPct - spy : null;
              return (
                <tr key={r.participant.id} className="transition-colors hover:bg-surface-2">
                  <td className="py-3 pl-5 pr-2 tnum text-fg-3">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: colors[i] }} />
                      <Link href={`/participant/${r.participant.id}`} className="font-medium text-fg hover:text-accent hover:underline">
                        {r.participant.label}
                      </Link>
                      {isPassive && (
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-3">
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
                  <td className="px-5 py-3 text-right">
                    {vsSpy == null ? <span className="text-fg-muted">—</span> : <Delta value={vsSpy} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-fg-muted">
        Advances daily via the Vercel cron. Re-running a day is a no-op. Paper trading — no real capital.
      </p>
    </section>
  );
}
