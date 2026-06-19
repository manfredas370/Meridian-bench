// Leaderboard + equity curves for one experiment. Server component.

import Link from "next/link";

import { colorFor, EquityChart } from "@/components/EquityChart";
import { fmtPct, fmtPctSigned, fmtUsd, signColor } from "@/lib/format";
import { benchmarkReturn, buildLeaderboard, tradingDayCount } from "@/lib/metrics";
import { getStore } from "@/lib/store";

export async function ExperimentView({ experimentId }: { experimentId: string }) {
  const store = getStore();
  const experiment = await store.getExperiment(experimentId);
  if (!experiment) return <p className="text-sm text-zinc-500">Experiment not found.</p>;

  const [participants, navHistory] = await Promise.all([
    store.listParticipants(experimentId),
    store.listNavHistory(experimentId),
  ]);
  const rows = buildLeaderboard(participants, navHistory);
  const spy = benchmarkReturn(rows, "SPY");
  const days = tradingDayCount(rows);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{experiment.name}</h1>
        <p className="text-sm text-zinc-500">
          {participants.length} participants · {days} trading {days === 1 ? "day" : "days"} ·{" "}
          {fmtUsd(experiment.startingCash)} starting capital ·{" "}
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
            {experiment.universe.length}-ticker universe
          </span>
        </p>
      </header>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <EquityChart rows={rows} startCash={experiment.startingCash} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 text-right font-medium">Total return</th>
              <th className="px-4 py-3 text-right font-medium">NAV</th>
              <th className="px-4 py-3 text-right font-medium">Max DD</th>
              <th className="px-4 py-3 text-right font-medium">Cash</th>
              <th className="px-4 py-3 text-right font-medium">vs SPY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {rows.map((r, i) => {
              const isPassive = r.participant.kind === "passive";
              const vsSpy = spy != null ? r.totalReturnPct - spy : null;
              return (
                <tr key={r.participant.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-4 py-3 tabular-nums text-zinc-500">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(i) }} />
                      <Link href={`/participant/${r.participant.id}`} className="font-medium hover:underline">
                        {r.participant.label}
                      </Link>
                      {isPassive && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500 dark:bg-zinc-800">
                          control
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${signColor(r.totalReturnPct)}`}>
                    {fmtPctSigned(r.totalReturnPct)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(r.latestNav)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{fmtPct(r.maxDrawdownPct)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{fmtPct(r.cashPct)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {vsSpy == null || isPassive ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <span className={signColor(vsSpy)}>{fmtPctSigned(vsSpy)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-400">
        Advance the simulation with <code className="font-mono">POST /api/dev/tick</code> (or the daily cron). Re-running a
        day is a no-op.
      </p>
    </section>
  );
}
